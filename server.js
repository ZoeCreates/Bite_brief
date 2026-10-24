//Code ripped from: https://www.linkedin.com/pulse/connecting-reactjs-nodejs-bit-by-bit-guide-ataur-rahman/

//For most of mysql2 stuff: https://sidorares.github.io/node-mysql2/docs/documentation/promise-wrapper

const express = require("express");
const app = express();
const port = process.env.PORT || 3001; //arbitrary
const email_rate = Number(process.env.EMAIL_INTERVAL_MS) || 24 * 60 * 60 * 1000; //once a day by default
const csv = require("fast-csv"); //to parse the csv
const path = require("path");
const crypto = require("crypto");
const cookieParser = require("cookie-parser");
const mysql = require("mysql2/promise");
const nodemailer = require("nodemailer");
const { OAuth2Client } = require("google-auth-library");

//must match the clientId in src/index.js
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  "270825436286-0m6k81c8eh6csonalrjrth42vg4tt5r4.apps.googleusercontent.com";
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

//cookies are signed so users can't just edit curUserId to become someone else.
//the database is rebuilt on every start anyway, so a random secret is fine for local runs
const COOKIE_SECRET =
  process.env.COOKIE_SECRET || crypto.randomBytes(32).toString("hex");

app.use(express.urlencoded({ extended: true }));
app.use(express.json()); //necessary for it to process post request which contain data
app.use(cookieParser(COOKIE_SECRET));
app.set("trust proxy", 1); //hosting platforms put the app behind an https proxy

let db;

//async keyword lets you use 'await'
async function main() {
  //because await can't be used in top-level, so let's make a function...
  db = await initialize();
  await readData();

  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });

  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    setInterval(email, email_rate); //email all users
  } else {
    console.log("EMAIL_USER / EMAIL_PASS not set, email notifications are off");
  }
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

//express 4 doesn't catch errors thrown in async handlers, which would crash the whole server
const handle = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

//returns the logged in user's id from the signed cookie, or null
function getUserID(req) {
  const userID = Number(req.signedCookies.curUserId);
  return Number.isInteger(userID) && userID > 0 ? userID : null;
}

function toID(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

//recount likes from Foods_Users so foods that lost all their likes go back to 0
async function refreshLikes() {
  await db.execute(`UPDATE Foods SET likes = (
    SELECT COUNT(*) FROM Foods_Users WHERE Foods_Users.food_id = Foods.id);`);
}

app.get("/api/search", handle(async (req, res) => {
  let searchTerm = req.query.term;
  if (!searchTerm) {
    return res.status(400).send("Search term is required");
  }
  let sql = `SELECT * FROM Foods WHERE name LIKE ?`;
  const [results] = await db.execute(sql, [`%${searchTerm}%`]);
  res.json(results);
}));

app.get("/api/user/uid", handle(async (req, res) => {
  let userID = getUserID(req);
  if (userID) {
    //the cookie might be from before the database was rebuilt
    const [users] = await db.execute("SELECT id FROM Users WHERE id = ?", [userID]);
    if (users.length === 0) {
      userID = null;
    }
  }
  res.json({ userID });
}));

//add searching result(fav dish) to database
app.post("/api/user/addToFavorites", handle(async (req, res) => {
  const userID = getUserID(req);
  const foodID = toID(req.body.foodID);

  if (!userID || !foodID) {
    return res.status(400).json({ message: "Missing user ID or food ID" });
  }

  var sql = `INSERT INTO Foods_Users (user_id, food_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id = user_id;`; //prevent duplicates
  await db.execute(sql, [userID, foodID]);
  res.json({ message: "Favorite added successfully." });
}));

app.get("/api/user/random", handle(async (req, res) => {
  const [users] = await db.execute(
    "SELECT id, username, fun_fact FROM Users ORDER BY RAND() LIMIT 1"
  );
  const user = users[0];
  if (user) {
    res.json({ user });
  } else {
    res.status(404).json({ message: "No users found" });
  }
}));

app.post("/api/user/addFact", handle(async (req, res) => {
  const userID = getUserID(req);
  const fact = req.body.fact;

  if (!userID || typeof fact !== "string") {
    return res.status(400).json({ message: "Missing userID or fact" });
  }

  await db.execute("UPDATE Users SET fun_fact = ? WHERE id = ?;", [
    fact.slice(0, 255),
    userID,
  ]);
  res.json({ message: "Fact added successfully." });
}));

app.get("/api/recommendeddish", handle(async (req, res) => {
  const userID = getUserID(req);
  const mealPeriodID = toID(req.query.mealPeriodID);

  if (!userID || !mealPeriodID) {
    return res
      .status(400)
      .json({ message: "Missing userID or mealPeriodID parameter" });
  }

  //foods in this meal period that don't contain any of the user's allergens.
  //if the user picked diets, the food also has to fit at least one of them
  const sql = `
    SELECT DISTINCT Foods.name, Foods.id
    FROM Foods
    JOIN Foods_MealPeriods ON Foods.id = Foods_MealPeriods.food_id
    WHERE Foods_MealPeriods.meal_id = ?
    AND Foods.id NOT IN (
      SELECT Allergies_Foods.food_id
      FROM Allergies_Foods
      JOIN Allergies_Users ON Allergies_Foods.allergy_id = Allergies_Users.allergy_id
      WHERE Allergies_Users.user_id = ?)
    AND (
      NOT EXISTS (SELECT 1 FROM Diets_Users WHERE Diets_Users.user_id = ?)
      OR Foods.id IN (
        SELECT Diets_Foods.food_id
        FROM Diets_Foods
        JOIN Diets_Users ON Diets_Foods.diet_id = Diets_Users.diet_id
        WHERE Diets_Users.user_id = ?));`;

  const [foods] = await db.execute(sql, [mealPeriodID, userID, userID, userID]);
  res.json(foods);
}));

app.post("/api/favdishes", handle(async (req, res) => {
  //send back the most liked foods
  await refreshLikes();
  const [foods] = await db.execute(`SELECT name, likes
    FROM Foods
    ORDER BY likes DESC
    LIMIT 10;`);
  res.json(foods);
}));

app.get("/api/severeAllergies", handle(async (req, res) => {
  let result = await ReturnAllergySeverityJSONFormat();
  res.json(result);
}));

app.post("/api/user/myFavDishes", handle(async (req, res) => {
  const userID = getUserID(req);
  if (!userID) {
    return res.status(400).json({ message: "Missing userID parameter" });
  }

  var sql = `SELECT Foods.name, Foods.id
  FROM Foods
  JOIN Foods_Users ON Foods_Users.food_id = Foods.id
  WHERE Foods_Users.user_id = ?;`;

  const [foods] = await db.execute(sql, [userID]);
  res.json(foods);
}));

app.post("/api/user/addAllergy", handle(async (req, res) => {
  const allergyID = toID(req.body.allergyID);
  const userID = getUserID(req);

  if (!userID || !allergyID) {
    return res.status(400).json({ message: "Missing userID or allergyID" });
  }

  var sql = `INSERT INTO Allergies_Users (allergy_id, user_id) VALUES
   (?, ?) ON DUPLICATE KEY UPDATE user_id = user_id;`;
  await db.execute(sql, [allergyID, userID]);
  res.json({ message: "Allergy added successfully." });
}));

app.post("/api/user/addDiet", handle(async (req, res) => {
  const dietID = toID(req.body.dietID);
  const userID = getUserID(req);
  if (!userID || !dietID) {
    return res.status(400).json({ message: "Missing userID or dietID" });
  }

  var sql = `INSERT INTO Diets_Users (diet_id, user_id) VALUES
   (?, ?) ON DUPLICATE KEY UPDATE user_id = user_id;`;
  await db.execute(sql, [dietID, userID]);
  res.json({ message: "Diet added successfully." });
}));

app.post("/api/user/myDiets", handle(async (req, res) => {
  const userID = getUserID(req);
  if (!userID) {
    return res.status(400).json({ message: "Missing userID parameter" });
  }

  var sql = `SELECT Diets.name, Diets.id
  FROM Diets
  JOIN Diets_Users ON Diets_Users.diet_id = Diets.id
  WHERE Diets_Users.user_id = ?
  ORDER BY Diets.id ASC;`;

  const [diets] = await db.execute(sql, [userID]);
  res.json(diets);
}));

app.post("/api/user/leftDiets", handle(async (req, res) => {
  const userID = getUserID(req);
  if (!userID) {
    return res.status(400).json({ message: "Missing userID parameter" });
  }

  var sql = `SELECT Diets.name, Diets.id
  FROM Diets
  WHERE Diets.id NOT IN (
    SELECT diet_id FROM Diets_Users WHERE user_id = ?
  )
  ORDER BY Diets.id ASC;`;

  const [diets] = await db.execute(sql, [userID]);
  res.json(diets);
}));

app.post("/api/user/myAllergies", handle(async (req, res) => {
  const userID = getUserID(req);
  if (!userID) {
    return res.status(400).json({ message: "Missing userID parameter" });
  }

  var sql = `SELECT Allergies.name, Allergies.id
  FROM Allergies
  JOIN Allergies_Users ON Allergies_Users.allergy_id = Allergies.id
  WHERE Allergies_Users.user_id = ?
  ORDER BY Allergies.id ASC;`;

  const [allergies] = await db.execute(sql, [userID]);
  res.json(allergies);
}));

app.post("/api/user/leftAllergies", handle(async (req, res) => {
  const userID = getUserID(req);
  if (!userID) {
    return res.status(400).json({ message: "Missing userID parameter" });
  }

  var sql = `SELECT Allergies.name, Allergies.id
    FROM Allergies
    WHERE Allergies.id NOT IN (
      SELECT allergy_id FROM Allergies_Users WHERE user_id = ?
    )
    ORDER BY Allergies.id ASC;`;

  const [allergies] = await db.execute(sql, [userID]);
  res.json(allergies);
}));

app.delete("/api/user/myFavDishes", handle(async (req, res) => {
  const foodID = toID(req.body.Fid);
  const userID = getUserID(req);
  if (!userID || !foodID) {
    return res.status(400).json({ message: "Missing userID or foodID" });
  }

  await db.execute(
    "DELETE FROM Foods_Users WHERE user_id = ? AND food_id = ?;",
    [userID, foodID]
  );
  await refreshLikes(); //also update like count
  res.json({ message: "Favorite removed." });
}));

app.delete("/api/user/myDiets", handle(async (req, res) => {
  const dietID = toID(req.body.Did);
  const userID = getUserID(req);
  if (!userID || !dietID) {
    return res.status(400).json({ message: "Missing userID or dietID" });
  }

  await db.execute(
    "DELETE FROM Diets_Users WHERE user_id = ? AND diet_id = ?;",
    [userID, dietID]
  );
  res.json({ message: "Diet removed." });
}));

app.delete("/api/user/myAllergies", handle(async (req, res) => {
  const allergyID = toID(req.body.Aid);
  const userID = getUserID(req);
  if (!userID || !allergyID) {
    return res.status(400).json({ message: "Missing userID or allergyID" });
  }

  await db.execute(
    "DELETE FROM Allergies_Users WHERE user_id = ? AND allergy_id = ?;",
    [userID, allergyID]
  );
  res.json({ message: "Allergy removed." });
}));

app.post("/api/user", handle(async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ error: "No credential passed" });
  }

  //check the Google ID token here instead of trusting whatever the client decoded,
  //otherwise anyone could log in as anyone by sending a made up email
  let data;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    data = ticket.getPayload();
  } catch (err) {
    console.log("invalid Google credential:", err.message);
    return res.status(401).json({ error: "Invalid Google credential" });
  }

  if (!data.email) {
    return res.status(400).json({ error: "Google account has no email" });
  }

  //BEATRICE. Why not just make searchQuery a global variable and use it as the user id when servicing other requests such as loading favorite dishes?
  //ISAAC, then we still need to pass the email around for each user, might as well just use their ID directly
  const searchQuery = "SELECT id FROM Users WHERE email = ? ORDER BY id LIMIT 1;";

  let [users] = await db.execute(searchQuery, [data.email]);
  if (users.length == 0) {
    //email DNE
    await db.execute("INSERT INTO Users (username, email) VALUES (?, ?);", [
      data.name || data.email,
      data.email,
    ]);
    [users] = await db.execute(searchQuery, [data.email]);
  }

  const cuid = Number(users[0].id);
  res.cookie("curUserId", cuid, {
    signed: true,
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
  });
  console.log("curUserID dredged from database in api/signup %s", cuid);
  res.json({ userID: cuid });
}));

async function InsertAllergySeverityIntoAllergies_UsersTable(userIndices, userID) //this function takes data about allergy severity from the client and inserts it into the DB
{
  for (const [key, value] of Object.entries(userIndices))
  {
    const allergy_id = toID(key);
    const severity = Number(value);
    if (!allergy_id || !Number.isInteger(severity) || severity < 0 || severity > 3) {
      continue;
    }
    await db.execute(`
    UPDATE Allergies_Users
    SET allergy_severity = (?)
    WHERE allergy_id = (?) AND user_id = (?);`, [severity, allergy_id, userID]);
  }
}

async function GetAllergySeverityInfoAboutAUser(UserID)
{
  const [allergy_data] = await db.execute(`
  SELECT allergy_id, allergy_severity
  FROM Allergies_Users
  WHERE user_id = (?);`, [UserID]);

  let allergyDataDictFormat = {};
  for (let row of allergy_data)
  {
    allergyDataDictFormat[row.allergy_id] = row.allergy_severity;
  }

  return allergyDataDictFormat;
}

app.get('/api/user/userIndices', handle(async (req, res) => {
  const userID = getUserID(req);
  if (!userID) {
    return res.status(400).json({ message: "Missing userID parameter" });
  }

  //index = allergy id, value = severity
  const result = await GetAllergySeverityInfoAboutAUser(userID);
  const newArray = Array.from({ length: 20 }, (_, index) => result[index] || 0);
  res.json(newArray);
}));

app.post('/api/user/userIndices', handle(async (req, res) => {
  const userIndices = req.body.userIndices;
  const userID = getUserID(req);
  if (!userID) {
    return res.status(400).json({ message: "Missing userID parameter" });
  }
  if (!userIndices || typeof userIndices !== "object") {
    return res.status(400).json({ message: "Missing userIndices" });
  }

  await InsertAllergySeverityIntoAllergies_UsersTable(userIndices, userID);
  res.json({ message: "success" });
}));

//in production the server also hands out the built react app (npm run build)
const buildDir = path.join(__dirname, "build");
app.use(express.static(buildDir));
app.get(/^(?!\/api\/).*/, (req, res, next) => {
  //let react-router handle pages like /myprofile
  res.sendFile(path.join(buildDir, "index.html"), (err) => {
    if (err) next();
  });
});

app.use((err, req, res, next) => {
  console.error(`Error in ${req.method} ${req.path}:`, err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ message: "Something went wrong" });
});

//////helper functions:

async function initialize() {
  //set DB_HOST, DB_USER, DB_PASSWORD and DB_NAME to match your mySQL setup
  //a pool reconnects on its own if the database drops an idle connection.
  //DATABASE_URL / MYSQL_URL (e.g. mysql://user:pass@host:3306/db) win over the separate settings
  const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;
  const connection = databaseUrl
    ? mysql.createPool({ uri: databaseUrl, multipleStatements: false })
    : mysql.createPool({
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "default_db", //usr/local/mysql/bin/mysql -u root -e "CREATE DATABASE IF NOT EXISTS default_db" -p
        multipleStatements: false, //protected against sql injections
      });
  await connection.query("SELECT 1"); //fail early if the database can't be reached
  console.log("connected to database");

  //I labeled the helper tables in alphabetical order, btw
  await connection.execute("DROP TABLE IF EXISTS Foods_Users;");
  await connection.execute("DROP TABLE IF EXISTS Allergies_Users;");
  await connection.execute("DROP TABLE IF EXISTS Diets_Users;");
  await connection.execute("DROP TABLE IF EXISTS Allergies_Foods;");
  await connection.execute("DROP TABLE IF EXISTS Diets_Foods;");
  await connection.execute("DROP TABLE IF EXISTS Foods_MealPeriods;");

  await connection.execute("DROP TABLE IF EXISTS Foods;"); //delete it if it already exists, for now
  await connection.execute("DROP TABLE IF EXISTS Users;");
  await connection.execute("DROP TABLE IF EXISTS Allergies;");
  await connection.execute("DROP TABLE IF EXISTS Diets;");
  await connection.execute("DROP TABLE IF EXISTS MealPeriods;"); //MealPeriod

  var createFoodsTable = `
  CREATE TABLE Foods (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL UNIQUE,
    available BOOL DEFAULT 1,
    likes BIGINT DEFAULT 0
    );`; //creating Foods table

  //username isn't UNIQUE because two Google accounts can have the same name
  var createUsersTable = `
  CREATE TABLE IF NOT EXISTS Users (
   id BIGINT AUTO_INCREMENT PRIMARY KEY,
   username VARCHAR(255) NOT NULL,
   email VARCHAR(255) NOT NULL,
   fun_fact VARCHAR(255) DEFAULT ''
  );`; //creating a Users table
  //email should also be UNIQUE, but removed to test email notifs

  var createAllergiesTable = `
  CREATE TABLE IF NOT EXISTS Allergies (
   id BIGINT AUTO_INCREMENT PRIMARY KEY,
   name VARCHAR(255) NOT NULL UNIQUE
  );`; //creating an Allergies table

  var createDietsTable = `
  CREATE TABLE IF NOT EXISTS Diets (
   id BIGINT AUTO_INCREMENT PRIMARY KEY,
   name VARCHAR(255) NOT NULL UNIQUE
  );`; //creating a Diets table

  var createMealPeriodsTable = `
  CREATE TABLE MealPeriods (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL UNIQUE
    );`; //creating Meal Period table

  ///////Helper tables
  var createFoodsUsersTable = `
  CREATE TABLE IF NOT EXISTS Foods_Users (
     food_id BIGINT,
     user_id BIGINT,
     FOREIGN KEY (food_id) REFERENCES Foods(id),
     FOREIGN KEY (user_id) REFERENCES Users(id),
     UNIQUE(food_id, user_id)
  );`; //helper table

  var createAllergiesUsersTable = `
  CREATE TABLE IF NOT EXISTS Allergies_Users (
     allergy_id BIGINT,
     user_id BIGINT,
     allergy_severity INT DEFAULT 0,
     FOREIGN KEY (allergy_id) REFERENCES Allergies(id),
     FOREIGN KEY (user_id) REFERENCES Users(id),
     UNIQUE(allergy_id, user_id)
  );`; //helper table

  var createDietsUsersTable = `
  CREATE TABLE IF NOT EXISTS Diets_Users (
    diet_id BIGINT,
    user_id BIGINT,
    FOREIGN KEY (diet_id) REFERENCES Diets(id),
    FOREIGN KEY (user_id) REFERENCES Users(id),
    UNIQUE(diet_id, user_id)
 );`; //helper table

  var createAllergiesFoodsTable = `
 CREATE TABLE IF NOT EXISTS Allergies_Foods (
   allergy_id BIGINT,
   food_id BIGINT,
   FOREIGN KEY (food_id) REFERENCES Foods(id),
   FOREIGN KEY (allergy_id) REFERENCES Allergies(id),
   UNIQUE(allergy_id, food_id)
);`; //helper table

  var createDietsFoodsTable = `
CREATE TABLE IF NOT EXISTS Diets_Foods (
  diet_id BIGINT,
  food_id BIGINT,
  FOREIGN KEY (diet_id) REFERENCES Diets(id),
  FOREIGN KEY (food_id) REFERENCES Foods(id),
  UNIQUE(diet_id, food_id)
);`; //helper table

  var createFoodsMealPeriodsTable = `
  CREATE TABLE IF NOT EXISTS Foods_MealPeriods (
     food_id BIGINT,
     meal_id BIGINT,
     FOREIGN KEY (food_id) REFERENCES Foods(id),
     FOREIGN KEY (meal_id) REFERENCES MealPeriods(id),
     UNIQUE(food_id, meal_id)
  );`; //helper table

  try {
    await connection.execute(createFoodsTable);
    await connection.execute(createUsersTable);
    await connection.execute(createAllergiesTable);
    await connection.execute(createDietsTable);
    await connection.execute(createMealPeriodsTable);
    await connection.execute(createFoodsUsersTable);
    await connection.execute(createAllergiesUsersTable);
    await connection.execute(createDietsUsersTable);
    await connection.execute(createAllergiesFoodsTable);
    await connection.execute(createDietsFoodsTable);
    await connection.execute(createFoodsMealPeriodsTable);

    console.log("Tables created successfully");
  } catch (err) {
    console.error("Error creating tables:", err);
    await connection.end();
    throw err;
  }

  return connection;
}

async function ReturnAllergySeverityJSONFormat()
{
    const [allergies] = await db.execute(`
    SELECT Allergies.name AS allergy_name,
    SUM(Allergies_Users.allergy_severity) AS severity
    FROM Allergies
    JOIN Allergies_Users ON Allergies.id = Allergies_Users.allergy_id
    GROUP BY Allergies.id, Allergies.name
    ORDER BY severity DESC`);

    let allergiesArray = allergies.map(row => ({
      name: row.allergy_name,
      severity: Number(row.severity)
  }));

  return allergiesArray;
}

//here we have some helper functions for filling tables
async function InsertNameIntoFoods(food_name) {
  await db.execute(
    "INSERT INTO Foods (name) VALUES (?) ON DUPLICATE KEY UPDATE id=id",
    [food_name]
  ); //тут надо походу возвращать айдишник, чтобы потом добавлять в хелпер таблицу

  const [r] = await db.execute("SELECT id FROM Foods WHERE name = (?)", [
    food_name,
  ]);
  return r[0].id;
}

async function InsertIdsIntoFoods_MealPeriodsTable(
  inserted_food_id,
  inserted_meal_id
) {
  await db.execute(
    "INSERT INTO Foods_MealPeriods (food_id, meal_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE food_id=food_id",
    [inserted_food_id, inserted_meal_id]
  );
}

async function InsertIdsIntoAllergies_FoodsTable(
  inserted_food_id,
  inserted_allergie_id
) {
  await db.execute(
    "INSERT INTO Allergies_Foods (allergy_id, food_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE food_id=food_id",
    [inserted_allergie_id, inserted_food_id]
  );
}

async function InsertIdsIntoDiets_FoodsTable(
  inserted_food_id,
  inserted_diet_id
) {
  await db.execute(
    "INSERT INTO Diets_Foods (diet_id, food_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE food_id=food_id",
    [inserted_diet_id, inserted_food_id]
  );
}

//findAMealPeriod
async function findAMealPeriod(mealPeriods_name) {
  //returns an ID of the meal period it found or null
  const [meals] = await db.execute(
    "SELECT id FROM MealPeriods WHERE name = (?)",
    [mealPeriods_name]
  );
  if (meals.length > 0) {
    return meals[0].id;
  } else {
    return null;
  }
}

async function findAnAllergie(allergie_name) {
  //returns an ID of the Allergie it found or null
  const [allergies] = await db.execute(
    "SELECT id FROM Allergies WHERE name = (?)",
    [allergie_name]
  );
  if (allergies.length > 0) {
    return allergies[0].id;
  } else {
    return null;
  }
}
//может их совместить?
async function findADiet(diet_name) {
  if (diet_name === "Vegetarianegan") {
    diet_name = "Vegan";
  }
  const [diets] = await db.execute("SELECT id FROM Diets WHERE name = (?)", [
    diet_name,
  ]);
  if (diets.length > 0) {
    return diets[0].id;
  } else {
    return null;
  }
}

function readCsvRows(file) {
  return new Promise((resolve, reject) => {
    const rows = [];
    csv
      .parseFile(file, { headers: true })
      .on("error", reject)
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows));
  });
}

async function readData() {
  //Insert webscrapped data into the database
  //the lookup tables have to be filled before the csv rows are matched against them
  await db.execute(`INSERT INTO Allergies (name) VALUES
  ('Contains alcohol'),
  ('Contains Gluten'),
  ('Contains Peanut'),
  ('Contains sesame'),
  ('Contains soy'),
  ('Contains tree nuts'),
  ('Contains Wheat'),
  ('Contains dairy'),
  ('Contains egg'),
  ('Contains fish'),
  ('Contains shellfish')
  ;`);
  await db.execute(`INSERT INTO Diets (name) VALUES
    ('Vegetarian'),
    ('Vegan'),
    ('Low Carbon Footprint'),
    ('High Carbon Footprint'),
    ('Halal menu option')
;`);
  await db.execute(`INSERT INTO MealPeriods (name) VALUES
    ('Breakfast'),
    ('Lunch'),
    ('Dinner')
;`);

  //Now here will go the code for reading some data from the csv file and putting it into the Foods table.
  //rows are handled one at a time so the inserts don't race each other
  const rows = await readCsvRows(
    path.join(__dirname, "bitebrief_webscraping_v1.xlsx - Sheet1.csv")
  );
  for (const row of rows) {
    //row выглядит как словарь, где ключи это названия заголовков а содержимое это данные
    const food_name = (row.dish_name || "").trim();
    if (!food_name || food_name.startsWith("w/")) {
      continue;
    }
    const inserted_food_id = await InsertNameIntoFoods(food_name);
    for (const header_csv of Object.keys(row)) {
      if (header_csv === "meal_period") {
        const MealPeriod_id = await findAMealPeriod(row[header_csv]);
        if (MealPeriod_id) {
          await InsertIdsIntoFoods_MealPeriodsTable(inserted_food_id, MealPeriod_id);
        }
      }

      if (header_csv.startsWith("Tag")) {
        const tag = row[header_csv]; //по сути row - это словарь, поэтому тут мы просто извлекаем по ключу headerа значения в этой строчке
        const Allergie_id = await findAnAllergie(tag);
        const Diet_id = await findADiet(tag);
        if (Allergie_id) {
          await InsertIdsIntoAllergies_FoodsTable(inserted_food_id, Allergie_id);
        }
        if (Diet_id) {
          await InsertIdsIntoDiets_FoodsTable(inserted_food_id, Diet_id);
        }
      }
    }
  }
  console.log("done parsing and filling tables");

  // dummy data
  var usersIn = `INSERT INTO Users (username, email, fun_fact) VALUES
    ('blen', 'bitebriefnoreply2@gmail.com', 'is very tired'),
    ('Mashamellow', 'bitebriefnoreply2@gmail.com' , 'is very happy'),
    ('Koopa', 'bitebriefnoreply2@gmail.com', 'likes emacs'),
    ('zeeehan', 'bitebriefnoreply2@gmail.com' , 'fast learner'),
    ('0xyw','bitebriefnoreply2@gmail.com' , 'good at styling'),
    ('Kyuki','bitebriefnoreply2@gmail.com', 'good at security')
  ;`;

  var foodsUsersIn = `INSERT INTO Foods_Users (food_id, user_id) VALUES
    (1, 6),
    (2, 6),
    (3, 1), (3, 6),
    (4, 2), (4, 5), (4, 6),
    (5,1), (5,2), (5,3), (5,4), (5,5), (5,6)
  ;`;
  var allergiesUsersIn = `INSERT INTO Allergies_Users (allergy_id, user_id, allergy_severity) VALUES
    (1, 4, 1), (1, 5, 1), (2, 1, 3)
  ;`;
  var dietsUsersIn = `INSERT INTO Diets_Users (diet_id, user_id) VALUES
  (3, 4), (1, 3)
;`;

  try {
    await db.execute(usersIn);
    await db.execute(foodsUsersIn);
    await db.execute(allergiesUsersIn);
    await db.execute(dietsUsersIn);
    await refreshLikes(); //update the like count of each food
  } catch (err) {
    console.log("Error inserting dummy data:", err);
  }
}

// https://www.w3schools.com/nodejs/nodejs_email.asp
// set EMAIL_USER and EMAIL_PASS (a gmail app password) to turn these on
async function email() {
  var transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  try {
    const [rUsers] = await db.execute("SELECT id, username, email FROM Users");
    for (const user of rUsers) {
      var sql = `SELECT MealPeriods.name AS meal, Foods.name FROM Foods
      JOIN Foods_Users ON Foods_Users.food_id = Foods.id
      JOIN Foods_MealPeriods ON Foods.id = Foods_MealPeriods.food_id
      JOIN MealPeriods ON MealPeriods.id = Foods_MealPeriods.meal_id
      WHERE Foods_Users.user_id = ? ORDER BY Foods_MealPeriods.meal_id ASC
      ;`;
      const [rFoods] = await db.execute(sql, [user.id]);
      if (rFoods.length === 0) {
        continue; //nothing to tell this user about
      }

      let msg = `Hello ${user.username},\nYour favorite foods available are:\n`;
      msg = msg + "Meal".padEnd(15, " ") + "Food\n";
      msg = msg + "".padEnd(40, "=") + "\n";
      for (const food of rFoods) {
        msg = msg + food.meal.padEnd(15, " ") + food.name + `\n`;
      }

      var mailOptions = {
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: `Sending your fav foods, ${user.username}`,
        text: msg,
      };

      transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
          console.log(error);
        } else {
          console.log("Email sent: " + info.response);
        }
      });
    }
  } catch (err) {
    console.log(err);
  }
}
