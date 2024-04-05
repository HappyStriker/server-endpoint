'use strict';

const formElement = document.getElementById('form');
const buttonElement = document.getElementById('button');


formElement.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = Object.fromEntries(new FormData(event.target));

  try {
    const response = await fetch(`http://localhost:8080/api/v1/formsubmit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formObject),
    });

    if (response.status === 200) {
      console.log(response);
    }
  } catch(error) {
    console.log(error);
  }
});
