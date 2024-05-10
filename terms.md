---
layout: page
title: Terms for Sampling
---

Sousastep's loops are not royalty free.

By sampling, you agree to the following terms:

- Listed as co-producer where applicable

- 25% publishing & distribution on any song independently released through streaming platforms

- If the song uploaded to streaming services is JUST instrumental, the splits are 50%

- If placed with an artist on a major label, must reach out below.

- 50/50 splits on beats sold to artists using these loops (inform artist of terms)

- If a loop is used as the entire/majority instrumental of a song, the split for distribution would be 50%

Do not add Sousastep as a primary artist or featured artist when uploading to streaming platforms

You do not have right to claim copyright on any of these samples, these are for non-exclusive use.

If you would like to use the music for anything outside of music release(game, tv, app, etc) please reach out below.

Anything NON PROFIT like non monetized YouTube/content/online games can sample freely.

Contact for more info: 

<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>

<form id="my-form" action="https://formspree.io/f/mjvnzgjr" method="POST">
  <label>Email:</label>
  <input type="email" name="email" />
  <label>Message:</label>
  <input type="text" name="message" />
  <button id="my-form-button">Submit</button>
  <p id="my-form-status"></p>
</form>
<br>
<br>
<br>
<br>
These terms are inspired by <a href="https://linktr.ee/rjpasin">@rjpasin</a>
</body>

<script>
    var form = document.getElementById("my-form");
    
    async function handleSubmit(event) {
      event.preventDefault();
      var status = document.getElementById("my-form-status");
      var data = new FormData(event.target);
      fetch(event.target.action, {
        method: form.method,
        body: data,
        headers: {
            'Accept': 'application/json'
        }
      }).then(response => {
        if (response.ok) {
          status.innerHTML = "Thanks for your submission!";
          form.reset()
        } else {
          response.json().then(data => {
            if (Object.hasOwn(data, 'errors')) {
              status.innerHTML = data["errors"].map(error => error["message"]).join(", ")
            } else {
              status.innerHTML = "Oops! There was a problem submitting your form"
            }
          })
        }
      }).catch(error => {
        status.innerHTML = "Oops! There was a problem submitting your form"
      });
    }
    form.addEventListener("submit", handleSubmit)
</script>

</html>