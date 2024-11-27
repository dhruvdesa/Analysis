export default function handler(req, res) {
    if (req.method === 'GET') {
      // Your logic to fetch last samples
      res.status(200).json({ samples: [] });
    } else {
      res.status(405).json({ error: 'Method Not Allowed' });
    }
  }
  