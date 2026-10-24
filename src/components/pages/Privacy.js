import React from 'react';

const Privacy = () => {
  return (
    <div className="privacy">
      <h1>Privacy Policy</h1>
      <p>Last updated: October 23, 2026</p>

      <h2>What we collect</h2>
      <p>When you sign in with Google, BiteBrief receives your name and email address from your Google account. We do not receive your Google password.</p>
      <p>While you use BiteBrief we also store what you enter: your favorite dishes, your diets, your allergies and how severe they are, and the fun fact you write about yourself.</p>

      <h2>How we use it</h2>
      <ul>
        <li>To recommend dining hall dishes that fit your diets and avoid your allergies.</li>
        <li>To email you when your favorite dishes are on the menu, if email notifications are turned on.</li>
        <li>To show a "User of the Day" on the home page. This shows your name and your fun fact to every visitor, so only write a fun fact you are happy to share.</li>
        <li>To show the Allergy Severity page, which adds up allergy severities across all users. It does not show who reported them.</li>
      </ul>

      <h2>Cookies</h2>
      <p>We use one cookie to keep you signed in. We do not use advertising or tracking cookies.</p>

      <h2>Sharing</h2>
      <p>We do not sell your information or share it with advertisers. It is stored in a database hosted on Railway, and notification emails are sent through Gmail.</p>

      <h2>Keeping and deleting your data</h2>
      <p>BiteBrief is a student project. Its database is reset whenever the service restarts, which deletes all user data. You can remove your favorites, diets and allergies at any time on the My Profile page.</p>

      <h2>Contact</h2>
      <p>Questions or deletion requests can be sent by opening an issue at <a href="https://github.com/ZoeCreates/Bite_brief/issues">github.com/ZoeCreates/Bite_brief</a>.</p>
    </div>
  );
};

export default Privacy;
