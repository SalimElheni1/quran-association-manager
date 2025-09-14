import React, { useState, useEffect, useCallback } from 'react';
import { Button, Table, Spinner, Alert } from 'react-bootstrap';
import { FaTrash, FaDownload } from 'react-icons/fa';
import ConfirmationModal from '../components/ConfirmationModal';
import { toast } from 'react-toastify';

function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState(null);

  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetchedTemplates = await window.electron.ipcRenderer.invoke('templates:get');
      setTemplates(fetchedTemplates);
      setError(null);
    } catch (err) {
      setError('فشل في تحميل القوالب. الرجاء المحاولة مرة أخرى.');
      toast.error('فشل في تحميل القوالب.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      handleUpload(file);
    }
  };

  const handleUpload = async (file) => {
    if (!file.name.endsWith('.docx')) {
      toast.error('الرجاء اختيار ملف بصيغة DOCX.');
      return;
    }
    try {
      await window.electron.ipcRenderer.invoke('templates:upload', {
        name: file.name,
        filePath: file.path,
      });
      toast.success('تم رفع القالب بنجاح!');
      fetchTemplates(); // Refresh list
    } catch (err) {
      toast.error(`فشل في رفع القالب: ${err.message}`);
    }
  };

  const handleDeleteClick = (template) => {
    setTemplateToDelete(template);
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    if (!templateToDelete) return;
    try {
      await window.electron.ipcRenderer.invoke('templates:delete', templateToDelete.id);
      toast.success('تم حذف القالب بنجاح.');
      fetchTemplates(); // Refresh list
    } catch (err) {
      toast.error('فشل في حذف القالب.');
    } finally {
      setShowConfirm(false);
      setTemplateToDelete(null);
    }
  };

  const handleDownload = async (template) => {
    try {
      const result = await window.electron.ipcRenderer.invoke('templates:download', template.id);
      if (result.success) {
        toast.success(`تم حفظ القالب في: ${result.filePath}`);
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      toast.error(`فشل في تحميل القالب: ${err.message}`);
    }
  };

  return (
    <div className="page-container">
      <h2>إدارة قوالب التصدير</h2>
      <p>
        هنا يمكنك رفع وإدارة قوالب DOCX المخصصة لتصدير البيانات.
      </p>

      <div className="mb-3">
        <Button onClick={() => document.getElementById('templateUpload').click()}>
          رفع قالب جديد
        </Button>
        <input
          type="file"
          id="templateUpload"
          style={{ display: 'none' }}
          accept=".docx"
          onChange={handleFileSelect}
        />
      </div>

      {isLoading && <Spinner animation="border" />}
      {error && <Alert variant="danger">{error}</Alert>}

      {!isLoading && !error && (
        <Table striped bordered hover responsive>
          <thead>
            <tr>
              <th>اسم القالب</th>
              <th>تاريخ الرفع</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.id}>
                <td>{template.name}</td>
                <td>{new Date(template.created_at).toLocaleString()}</td>
                <td>
                  <Button variant="success" size="sm" onClick={() => handleDownload(template)} className="me-2">
                    <FaDownload /> تحميل
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDeleteClick(template)}>
                    <FaTrash /> حذف
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <ConfirmationModal
        show={showConfirm}
        onConfirm={confirmDelete}
        onCancel={() => setShowConfirm(false)}
        title="تأكيد الحذف"
        message={`هل أنت متأكد أنك تريد حذف القالب "${templateToDelete?.name}"؟`}
      />
    </div>
  );
}

export default TemplatesPage;
