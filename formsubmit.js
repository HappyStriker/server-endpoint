'use strict';

let formElement = document.getElementById("form");
let buttonElement = document.getElementById("button");

formElement.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(event.target);

  let formObject = {};
  formData.forEach((value, key) => {
    formObject[key] = value;
  });

  try{
    const response = await fetch(`http://localhost:8080/api/v1/formsubmit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formObject),
    });

    if(response.status === 200){
      console.log(response)
    }
  } catch(error){
    console.log(error)
  }
});
