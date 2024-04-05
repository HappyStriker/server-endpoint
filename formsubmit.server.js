'use strict';


const mailer = require('../system/library/mail.js');
const config = require('../system/config/mail.json');
const fs = require('node:fs/promises');


// Rate limiting settings
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 10; // Max 10 requests per window per IP


// Store request counts per IP
const requestCounts = {};


// Cleanup old entries
setInterval(() => {
  const threshold = Date.now() - RATE_LIMIT_WINDOW_MS;
  Object.keys(requestCounts).forEach(ip => {
    if (requestCounts[ip].time < threshold) {
      delete requestCounts[ip];
    }
  });
}, RATE_LIMIT_WINDOW_MS);


// Specify allowed origins
const allowedOrigins = ['http://127.0.0.1:62052'];


const isValidMail = /[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/i;


// <h1>Hallo Welt</h1>
// <script>alert('XSS')</script>
// <img src="x" onerror="alert('XSS')">
// <a href="http://code.example.com">Click me</a>
// <a href="javascript:alert('XSS')">Click me</a>
// <style>@import 'http://code.example.com/code.css';</style>
// <div style="background:url(javascript:alert('XSS'))">Test</div>
// {{ <script>alert('XSS')</script> }} or {% <script>alert('XSS')</script> %}
// {{ alert('XSS') }}  {% alert('XSS') %}
// {{ <div style="background:url(javascript:alert('XSS'))">Test</div> }}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};


endpoints.add('/api/v1/formsubmit', async (request, response) => {
  const ip = request.socket.remoteAddress;
  const now = Date.now();

  if (!requestCounts[ip] || requestCounts[ip].time < now - RATE_LIMIT_WINDOW_MS) {
    requestCounts[ip] = { count: 1, time: now };
  } else {
    requestCounts[ip].count++;
  }

  if (requestCounts[ip].count > MAX_REQUESTS_PER_WINDOW) {
    response.writeHead(429, { 'Content-Type': 'text/plain' });
    response.end('Too Many Requests');
    return;
  }

  //server request security checks;

  //check if the request origin is allowed to send data to the server.
  const requestOrigin = request.headers.origin;
  if (!allowedOrigins.includes(requestOrigin)) {
    response.statusCode = 403;
    response.end('Origin not allowed');
    return;
  }

  //check if the browser sends an OPTIONS request to set necessary CORS headers;
  if (request.method === 'OPTIONS') {
    // Set necessary CORS headers for preflight response
    response.setHeader('Access-Control-Allow-Origin', allowedOrigins[0]);
    response.setHeader('Access-Control-Allow-Methods', 'POST');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.statusCode = 204; // No Content
    response.end();
    return;
  }

  //only allows POST requests.
  if (request.method !== 'POST') return 403;

  //check if the request actually contains json data;
  if (request.headers['content-type'] !== 'application/json') return 400;

  //checks the content length of the body in the request headers to avoid overloading the server.
  const size = parseInt(request.headers['content-length']);
  if (isNaN(size) || size > 1000) return 413;

  //collect the data from the request body
  let body = '';
  try {
    const data = await new Promise((resolve, reject) => {
      const chunks = [];
      request.on('data', (chunk) => chunks.push(chunk));
      request.on('end', () => {
        resolve((Buffer.concat(chunks)));
      });
      request.on('error', (error) => {
        reject(error);
      });
    });

    body = JSON.parse(data);

    if(typeof body !== 'object') throw 'Data is not an Object.';
    if(Object.keys(body).length !== 5) throw 'Wrong amount of keys';
    for(let value of Object.values(body)){
      if(value === '') throw 'Missing form data';
    };
    if(!body.email.match(isValidMail)) throw 'Not a valid mail address.';

  } catch(error){
    console.log(error);
    response.end();
    return;
  }

  //escape html or code input for security improvement;
  //test examples that were correctly converted into plain text by the function; no execution or html inserted;
  const escapedFirstName = escapeHtml(body.firstname);
  const escapedLastName = escapeHtml(body.lastname);
  const escapedPhone = escapeHtml(body.phone);
  const escapedEmail = escapeHtml(body.email);
  const escapedMessage = escapeHtml(body.message);

  //send the form data to the given email address
  //mailer.send(to, subject, body)
  let template;
  try {
    template = await fs.readFile('../system/templates/formsubmit.html', 'utf-8');
  } catch {
    template = await fs.readFile('system/templates/formsubmit.html', 'utf-8');
  }

  // safely try to send the password reset mail to the user
  try {
    await mailer.send(
      config.mail,
      'Neue Kundenanfrage auf Katzentrainer-riedl.com',
      template
        .replaceAll('%FIRSTNAME%', escapedFirstName)
        .replaceAll('%LASTNAME%', escapedLastName)
        .replaceAll('%PHONE%', escapedPhone)
        .replaceAll('%EMAIL%', escapedEmail)
        .replaceAll('%MESSAGE%', escapedMessage),
    );
  }

  // catch the error in case the mail could not be sent, but fail silently, so we do not leak any
  // information to the user about it, due to security considerations
  catch(error) {
    console.log('Sending the email failed:', error);
    response.statusCode = 500;
    response.end('Ein interner Fehler ist aufgetreten.');
    return;
  }

  //set headers for the response if no errors occurred
  response.statusCode = 200;
  response.setHeader('Access-Control-Allow-Origin', requestOrigin);
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ message: 'Success' }));
  return;
});
