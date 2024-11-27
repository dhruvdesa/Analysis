export default function handler(req, res) {
    if (req.method === 'POST') {
      // Your logic to handle file upload
      res.status(200).json({ message: 'File uploaded successfully' });
    } else {
      res.status(405).json({ error: 'Method Not Allowed' });
    }
  }
  