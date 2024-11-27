export default function handler(req, res) {
    if (req.method === 'GET') {
      // Your logic to fetch accuracy
      res.status(200).json({ accuracy: 95.5 });
    } else {
      res.status(405).json({ error: 'Method Not Allowed' });
    }
  }
  