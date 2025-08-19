import React from 'react';

function BarChart({ data }) {
  const width = 400;
  const height = 300;

  // Simple placeholder for now - will implement D3 charts later
  return (
    <div
      style={{
        width: `${width}px`,
        height: `${height}px`,
        border: '1px solid #ddd',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
        borderRadius: '8px',
        margin: '10px',
      }}
    >
      <span style={{ color: '#666', fontSize: '14px' }}>سيتم إضافة الرسم البياني قريباً</span>
    </div>
  );
}

export default BarChart;
