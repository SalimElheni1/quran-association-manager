# Translation and Notification Conventions

This document outlines the conventions for user-facing text (translations) and notifications within the Quran Branch Manager application.

## Arabic Language Conventions

The application's primary user-facing language is Arabic. The following conventions should be followed to ensure consistency and a professional tone:

1.  **Clarity and Formality**: Use clear, formal Arabic. Avoid colloquialisms or overly casual language. For example, use "الشؤون المالية" instead of "المالية".
2.  **Conciseness**: Keep labels and button texts concise and to the point. For example, use "إضافة طالب" instead of "إضافة طالب جديد".
3.  **Consistency**: Use consistent terminology throughout the application. For example, always use "شؤون الطلاب" to refer to student management.
4.  **Contextual Accuracy**: Ensure that the translation accurately reflects the context of the UI element. For example, use "الرئيسية" for the main dashboard link.

## Notification System

All user notifications should be displayed using toast messages. The application uses the `react-toastify` library for this purpose. A centralized utility has been created at `src/renderer/utils/toast.js` to standardize the appearance and behavior of these notifications.

### Usage

To display a notification, import the appropriate function from the `toast.js` utility:

```javascript
import { showSuccessToast, showErrorToast, showInfoToast, showWarningToast } from '../utils/toast';

// Example usage
showSuccessToast('تم تحديث البيانات بنجاح!');
showErrorToast('فشل في تحميل البيانات.');
```

### Notification Types

*   **Success (`showSuccessToast`)**: Use for successful operations, such as creating, updating, or deleting data. The message should be specific and confirm the action that was taken (e.g., "تم حذف الطالب 'اسم الطالب' بنجاح.").
*   **Error (`showErrorToast`)**: Use for failed operations or unexpected errors. The message should clearly state what went wrong.
*   **Info (`showInfoToast`)**: Use for general information or neutral messages.
*   **Warning (`showWarningToast`)**: Use for non-critical issues or to warn the user about a potential problem.

### Raw Alerts

Raw `alert()` or `window.confirm()` calls should not be used. For confirmations, use the `ConfirmationModal` component to provide a consistent and professional user experience.
