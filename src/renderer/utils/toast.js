/**
 * @fileoverview Centralized toast notification utilities for Quran Branch Manager.
 * Provides consistent styling and behavior for all application notifications.
 *
 * This module standardizes toast notifications across the application using
 * react-toastify with predefined styling and behavior options.
 *
 * @author Quran Branch Manager Team
 * @version 1.0.2-beta
 * @requires react-toastify - Toast notification library
 */

import { toast } from 'react-toastify';

/**
 * Default configuration options for all toast notifications.
 * These settings ensure consistent appearance and behavior across the application.
 *
 * @type {Object}
 * @constant
 */
const defaultOptions = {
  position: 'top-right', // Position on screen
  autoClose: 5000, // Auto-close after 5 seconds
  hideProgressBar: false, // Show progress bar
  closeOnClick: true, // Allow click to close
  pauseOnHover: true, // Pause timer on hover
  draggable: true, // Allow drag to dismiss
  progress: undefined, // Use default progress behavior
  theme: 'colored', // Use colored theme
};

/**
 * Displays a success toast notification.
 * Use for successful operations like data saves, updates, or deletions.
 *
 * @param {string} message - The success message to display
 * @example
 * showSuccessToast('تم حفظ البيانات بنجاح!');
 */
export const showSuccessToast = (message) => {
  toast.success(message, defaultOptions);
};

/**
 * Displays an error toast notification.
 * Use for failed operations, validation errors, or unexpected errors.
 *
 * @param {string} message - The error message to display
 * @example
 * showErrorToast('فشل في حفظ البيانات. يرجى المحاولة مرة أخرى.');
 */
export const showErrorToast = (message) => {
  toast.error(message, defaultOptions);
};

/**
 * Displays an informational toast notification.
 * Use for general information or neutral messages.
 *
 * @param {string} message - The informational message to display
 * @example
 * showInfoToast('تم تحديث النظام إلى الإصدار الجديد.');
 */
export const showInfoToast = (message) => {
  toast.info(message, defaultOptions);
};

/**
 * Displays a warning toast notification.
 * Use for non-critical issues or to warn users about potential problems.
 *
 * @param {string} message - The warning message to display
 * @example
 * showWarningToast('تأكد من حفظ عملك قبل الخروج.');
 */
export const showWarningToast = (message) => {
  toast.warn(message, defaultOptions);
};
