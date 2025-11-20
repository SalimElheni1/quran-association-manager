import React, { useState } from 'react';
import { Form, InputGroup, Button } from 'react-bootstrap';
// Inline SVG icons to replace react-icons (saves ~82MB)
const FaEye = () => (
  <svg width="16" height="16" fill="currentColor" viewBox="0 0 576 512">
    <path d="M288 32c-80.8 0-145.5 36.8-192.6 80.6C48.6 156 17.3 208 2.5 243.7c-3.3 7.9-3.3 16.7 0 24.6C17.3 304 48.6 356 95.4 399.4C142.5 443.2 207.2 480 288 480s145.5-36.8 192.6-80.6c46.8-43.5 78.1-95.4 93-131.1c3.3-7.9 3.3-16.7 0-24.6c-14.9-35.7-46.2-87.7-93-131.1C433.5 68.8 368.8 32 288 32zM144 256a144 144 0 1 1 288 0 144 144 0 1 1 -288 0zm144-64c0 35.3-28.7 64-64 64c-7.1 0-13.9-1.2-20.3-3.3c-5.5-1.8-11.9 1.6-11.7 7.4c.3 6.9 1.3 13.8 3.2 20.7c13.7 51.2 66.4 81.6 117.6 67.9s81.6-66.4 67.9-117.6c-11.1-41.5-47.8-69.4-92.7-69.4c-6.2 0-11.4 5.2-11.4 11.4s5.2 11.4 11.4 11.4c28.7 0 52 23.3 52 52z" />
  </svg>
);

const FaEyeSlash = () => (
  <svg width="16" height="16" fill="currentColor" viewBox="0 0 640 512">
    <path d="M38.8 5.1C28.4-3.1 13.3-1.2 5.1 9.2S-1.2 34.7 9.2 42.9l592 464c10.4 8.2 25.5 6.3 33.7-4.1s6.3-25.5-4.1-33.7L525.6 386.7c39.6-40.6 66.4-86.1 79.9-118.4c3.3-7.9 3.3-16.7 0-24.6c-14.9-35.7-46.2-87.7-93-131.1C465.5 68.8 400.8 32 320 32c-68.2 0-125 26.3-169.3 60.8L38.8 5.1zM223.1 149.5C248.6 126.2 282.7 112 320 112c79.5 0 144 64.5 144 144c0 24.9-6.3 48.3-17.4 68.7L408 294.5c8.4-19.3 10.6-41.4 4.8-63.3c-11.1-41.5-47.8-69.4-92.7-69.4c-26.2 0-49.3 12.4-64.2 31.7L223.1 149.5zM320 480c68.2 0 125-26.3 169.3-60.8l-47.4-37.2c-31.4 18.2-67.7 29-106.9 29c-79.5 0-144-64.5-144-144c0-6.9 .5-13.6 1.4-20.2L83.1 161.5C60.3 191.2 44 220.8 34.5 243.7c-3.3 7.9-3.3 16.7 0 24.6c14.9 35.7 46.2 87.7 93 131.1C174.5 443.2 239.2 480 320 480z" />
  </svg>
);

const PasswordInput = ({
  name,
  value,
  onChange,
  placeholder,
  required = false,
  label = 'كلمة المرور',
  className = 'mb-2',
  helpText,
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <Form.Group className={className}>
      {label && <Form.Label>{label}</Form.Label>}
      <div style={{ position: 'relative' }}>
        <Form.Control
          type={showPassword ? 'text' : 'password'}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          style={{ paddingLeft: '40px' }}
          {...props}
        />
        <Button
          variant="link"
          onClick={togglePasswordVisibility}
          style={{
            position: 'absolute',
            left: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            border: 'none',
            background: 'transparent',
            padding: '0',
            color: '#6c757d',
            zIndex: 2,
          }}
          className="p-0"
        >
          {showPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
        </Button>
      </div>
      {helpText && <Form.Text className="text-muted">{helpText}</Form.Text>}
    </Form.Group>
  );
};

export default PasswordInput;
