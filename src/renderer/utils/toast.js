import { toast } from 'react-toastify';

const defaultOptions = {
  position: 'top-right',
  autoClose: 5000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
  progress: undefined,
  theme: 'colored',
};

export const showSuccessToast = (message) => {
  toast.success(message, defaultOptions);
};

export const showErrorToast = (message) => {
  toast.error(message, defaultOptions);
};

export const showInfoToast = (message) => {
  toast.info(message, defaultOptions);
};

export const showWarningToast = (message) => {
  toast.warn(message, defaultOptions);
};
