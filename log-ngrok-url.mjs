// log-ngrok-url.js
import fetch from 'node-fetch';

const getNgrokUrl = async () => {
  try {
    const res = await fetch('http://127.0.0.1:4040/api/tunnels');
    const data = await res.json();
    const url = data.tunnels?.find((t) => t.public_url?.startsWith('https'))?.public_url;
    if (url) {
      console.log('✅ Ngrok public URL:', url);
    } else {
      console.log('❌ Ngrok URL not found yet.');
    }
  } catch (err) {
    console.error('Error fetching ngrok URL:', err.message);
  }
};

setTimeout(getNgrokUrl, 4000); // give ngrok 4 seconds to start
