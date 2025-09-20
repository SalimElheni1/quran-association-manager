import '@testing-library/jest-dom';

// Mock window.electronAPI
global.window.electronAPI = {
  login: jest.fn(),
  logout: jest.fn(),
  isPackaged: jest.fn().mockResolvedValue(false),
  getLogo: jest.fn().mockResolvedValue({ success: true, path: 'assets/logos/icon.png' }),
  onForceLogout: jest.fn().mockReturnValue(() => {}),
  onShowInitialCredentials: jest.fn().mockReturnValue(() => {}),
};

// Mock react-toastify
jest.mock('react-toastify', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock react-router-dom
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
  Navigate: ({ to }) => <div data-testid="navigate" data-to={to} />,
}));

// Mock react-bootstrap components
jest.mock('react-bootstrap', () => {
  const MockCard = ({ children, className, ...props }) => (
    <div data-testid="card" className={className} {...props}>{children}</div>
  );
  MockCard.Body = ({ children, ...props }) => (
    <div data-testid="card-body" {...props}>{children}</div>
  );
  MockCard.Title = ({ children, ...props }) => (
    <h5 data-testid="card-title" {...props}>{children}</h5>
  );
  MockCard.Text = ({ children, ...props }) => (
    <p data-testid="card-text" {...props}>{children}</p>
  );

  const MockForm = ({ children, ...props }) => (
    <form data-testid="form" {...props}>{children}</form>
  );
  MockForm.Group = ({ children, ...props }) => (
    <div data-testid="form-group" {...props}>{children}</div>
  );
  MockForm.Label = ({ children, ...props }) => (
    <label data-testid="form-label" {...props}>{children}</label>
  );
  MockForm.Control = ({ ...props }) => (
    <input data-testid="form-control" {...props} />
  );
  MockForm.Text = ({ children, ...props }) => (
    <div data-testid="form-text" {...props}>{children}</div>
  );

  return {
    Form: MockForm,
    Button: ({ children, ...props }) => <button data-testid="button" {...props}>{children}</button>,
    Container: ({ children, ...props }) => <div data-testid="container" {...props}>{children}</div>,
    Card: MockCard,
    Alert: ({ children, ...props }) => <div data-testid="alert" {...props}>{children}</div>,
    Row: ({ children, ...props }) => <div data-testid="row" {...props}>{children}</div>,
    Col: ({ children, ...props }) => <div data-testid="col" {...props}>{children}</div>,
    InputGroup: ({ children, ...props }) => <div data-testid="input-group" {...props}>{children}</div>,
    Spinner: ({ ...props }) => <div data-testid="spinner" {...props} />,
  };
});

// Mock react-icons
jest.mock('react-icons/fa', () => ({
  FaEye: () => <span data-testid="fa-eye" />,
  FaEyeSlash: () => <span data-testid="fa-eye-slash" />,
}));

// Mock CSS imports that actually exist
jest.mock('../../src/renderer/styles/StudentsPage.css', () => ({}));
jest.mock('../../src/renderer/styles/LoginPage.css', () => ({}));
jest.mock('@renderer/styles/StudentsPage.css', () => ({}));
jest.mock('@renderer/styles/LoginPage.css', () => ({}));