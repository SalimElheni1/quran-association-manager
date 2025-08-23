import React, { useState } from 'react';
import { Form, InputGroup, Button } from 'react-bootstrap';
import { FaEye, FaEyeSlash } from 'react-icons/fa';

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
