import '@testing-library/jest-dom';

// Mock window.electronAPI
global.window.electronAPI = {
  login: jest.fn().mockResolvedValue({ success: true }),
  logout: jest.fn(),
  isPackaged: jest.fn().mockResolvedValue(false),
  getLogo: jest.fn().mockResolvedValue({ success: true, path: 'test-logo.png' }),
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
jest.mock('react-router-dom', () => {
  const Navigate = ({ to }) => <div data-testid="navigate" data-to={to} />;
  Navigate.displayName = 'Navigate';
  
  return {
    ...jest.requireActual('react-router-dom'),
    useNavigate: () => jest.fn(),
    Navigate,
  };
});

// Mock react-bootstrap components
jest.mock('react-bootstrap', () => {
  const MockCard = ({ children, className, ...props }) => (
    <div data-testid="card" className={className} {...props}>
      {children}
    </div>
  );
  MockCard.displayName = 'MockCard';
  MockCard.Body = ({ children, ...props }) => (
    <div data-testid="card-body" {...props}>
      {children}
    </div>
  );
  MockCard.Body.displayName = 'MockCard.Body';
  MockCard.Title = ({ children, ...props }) => (
    <h5 data-testid="card-title" {...props}>
      {children}
    </h5>
  );
  MockCard.Title.displayName = 'MockCard.Title';
  MockCard.Text = ({ children, ...props }) => (
    <p data-testid="card-text" {...props}>
      {children}
    </p>
  );
  MockCard.Text.displayName = 'MockCard.Text';

  const MockForm = ({ children, ...props }) => (
    <form data-testid="form" {...props}>
      {children}
    </form>
  );
  MockForm.displayName = 'MockForm';
  MockForm.Group = ({ children, ...props }) => (
    <div data-testid="form-group" {...props}>
      {children}
    </div>
  );
  MockForm.Group.displayName = 'MockForm.Group';
  MockForm.Label = ({ children, ...props }) => (
    <label data-testid="form-label" {...props}>
      {children}
    </label>
  );
  MockForm.Label.displayName = 'MockForm.Label';
  MockForm.Control = ({ ...props }) => <input data-testid="form-control" {...props} />;
  MockForm.Control.displayName = 'MockForm.Control';
  MockForm.Text = ({ children, ...props }) => (
    <div data-testid="form-text" {...props}>
      {children}
    </div>
  );
  MockForm.Text.displayName = 'MockForm.Text';

  const Button = ({ children, ...props }) => (
    <button data-testid="button" {...props}>
      {children}
    </button>
  );
  Button.displayName = 'Button';
  
  const Container = ({ children, ...props }) => (
    <div data-testid="container" {...props}>
      {children}
    </div>
  );
  Container.displayName = 'Container';
  
  const Alert = ({ children, ...props }) => (
    <div data-testid="alert" {...props}>
      {children}
    </div>
  );
  Alert.displayName = 'Alert';
  
  const Row = ({ children, ...props }) => (
    <div data-testid="row" {...props}>
      {children}
    </div>
  );
  Row.displayName = 'Row';
  
  const Col = ({ children, ...props }) => (
    <div data-testid="col" {...props}>
      {children}
    </div>
  );
  Col.displayName = 'Col';
  
  const InputGroup = ({ children, ...props }) => (
    <div data-testid="input-group" {...props}>
      {children}
    </div>
  );
  InputGroup.displayName = 'InputGroup';
  
  const Spinner = ({ ...props }) => <div data-testid="spinner" {...props} />;
  Spinner.displayName = 'Spinner';

  return {
    Form: MockForm,
    Button,
    Container,
    Card: MockCard,
    Alert,
    Row,
    Col,
    InputGroup,
    Spinner,
  };
});

// Mock react-icons
jest.mock('react-icons/fa', () => {
  const FaEye = () => <span data-testid="fa-eye" />;
  FaEye.displayName = 'FaEye';
  
  const FaEyeSlash = () => <span data-testid="fa-eye-slash" />;
  FaEyeSlash.displayName = 'FaEyeSlash';
  
  return {
    FaEye,
    FaEyeSlash,
  };
});
