import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import StudentsPage from '../StudentsPage';

// Mock necessary dependencies
jest.mock('react-toastify', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

// Mock the electronAPI provided via the preload script
const mockElectronAPI = {
  getStudents: jest.fn().mockResolvedValue([]),
  getStudentById: jest.fn(),
  addStudent: jest.fn(),
  updateStudent: jest.fn(),
  deleteStudent: jest.fn(),
  getGroups: jest.fn().mockResolvedValue([]),
  addGroup: jest.fn(),
  updateGroup: jest.fn(),
  deleteGroup: jest.fn(),
};
global.window.electronAPI = mockElectronAPI;

describe('StudentsPage', () => {
  beforeEach(() => {
    // Clear mock history before each test
    jest.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <StudentsPage />
      </MemoryRouter>,
    );
  };

  it('should render the main heading and the "Add Student" button', async () => {
    renderComponent();

    // Check for the main heading
    expect(screen.getByRole('heading', { name: /شؤون الطلاب/i })).toBeInTheDocument();

    // Check for the "Add Student" button
    expect(screen.getByRole('button', { name: /إضافة طالب/i })).toBeInTheDocument();
  });

  it('should render the "Students" and "Groups" tabs', async () => {
    renderComponent();
    expect(screen.getByRole('tab', { name: 'الطلاب' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'المجموعات' })).toBeInTheDocument();
  });
});