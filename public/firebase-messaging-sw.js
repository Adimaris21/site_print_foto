importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyC-b9KS5OZ4ckOSEfAyLFm9QQuZqM9teO4",
  authDomain: "print-foto-7409e.firebaseapp.com",
  projectId: "print-foto-7409e",
  storageBucket: "print-foto-7409e.firebasestorage.app",
  messagingSenderId: "103953800507"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('Notificare primită în fundal:', payload);
});