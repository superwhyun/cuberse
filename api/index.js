// Vercel용 기본 API 핸들러
export default function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method === 'GET') {
    res.status(200).json({ 
      message: 'Cuberse API is running on Vercel',
      timestamp: new Date().toISOString(),
      version: '2.0.0'
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
// %%%%%LAST%%%%%