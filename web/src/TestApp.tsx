export default function TestApp() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#1a1a1a',
      color: '#fff',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1 style={{
        fontSize: '3rem',
        marginBottom: '1rem',
        background: 'linear-gradient(135deg, #A770E4 0%, #FF6060 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text'
      }}>
        MAP2 Audio Platform
      </h1>
      <p style={{ fontSize: '1.2rem', marginBottom: '2rem' }}>
        Native WebSocket API - Test Screen
      </p>
      <div style={{
        padding: '2rem',
        backgroundColor: '#2a2a2a',
        borderRadius: '8px',
        maxWidth: '600px'
      }}>
        <h2 style={{ marginBottom: '1rem' }}>Status</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li style={{ marginBottom: '0.5rem' }}>✅ Frontend: Running</li>
          <li style={{ marginBottom: '0.5rem' }}>✅ Backend: {window.location.origin}</li>
          <li style={{ marginBottom: '0.5rem' }}>✅ WebSocket: {window.location.origin.replace(/^http/, 'ws')}/ws/v1</li>
          <li style={{ marginBottom: '0.5rem' }}>✅ PiPedal Removed</li>
        </ul>
        <p style={{ marginTop: '1.5rem', fontSize: '0.9rem', color: '#888' }}>
          If you see this, React and the shared frontend runtime are loading correctly.
        </p>
      </div>
    </div>
  );
}
