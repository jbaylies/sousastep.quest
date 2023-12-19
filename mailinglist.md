---
layout: page
title: Mailing List
---

<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: Arial, sans-serif;
        }

        .listmonk-form {
            max-width: 400px;
        }

        h3 {
            font-size: 24px;
            color: #333;
        }

        p {
            margin-bottom: 10px;
        }

        input[type="email"],
        input[type="text"] {
            width: 100%;
            padding: 10px;
            box-sizing: border-box;
            font-size: 16px;
        }

        input[type="checkbox"] {
            margin-right: 5px;
        }

        input[type="submit"] {
            background-color: #4CAF50;
            color: white;
            padding: 12px 20px;
            font-size: 18px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            width: 100%; /* Make the button full-width */
        }

        input[type="submit"]:hover {
            background-color: #45a049;
        }
    </style>
</head>
<body>

<form method="post" action="https://sousastep.pikapod.net/subscription/form" class="listmonk-form">
    <div>
        <h3>Subscribe</h3>
        <input type="hidden" name="nonce" />
        <p><input type="email" name="email" required placeholder="E-mail" /></p>
        <p><input type="text" name="name" placeholder="Name (optional)" /></p>
        <p>
            <input id="94875" type="checkbox" name="l" checked value="94875614-88f9-49e2-8f9a-78e5e6e1aac3" />
            <label for="94875">Stay informed about new releases.</label>
        </p>
        <p><input type="submit" value="Subscribe" /></p>
    </div>
</form>

</body>
</html>
