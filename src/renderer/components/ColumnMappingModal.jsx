import React, { useState, useEffect } from 'react';
import { Modal, Button, Table, Alert, Form, Badge, Tab, Nav } from 'react-bootstrap';

const ColumnMappingModal = ({ show, analysis, onConfirm, onCancel }) => {
  const [mappings, setMappings] = useState({});
  const [systemMappings, setSystemMappings] = useState(null);
  const [activeSheet, setActiveSheet] = useState(null);

  useEffect(() => {
    // Fetch the system mapping configuration once
    window.electronAPI.getColumnMappings().then(setSystemMappings);
  }, []);

  useEffect(() => {
    if (show && analysis) {
      // When the modal is shown, initialize the mappings from the suggestions
      const initialMappings = {};
      for (const sheetName in analysis.sheets) {
        initialMappings[sheetName] = { ...analysis.sheets[sheetName].suggestedMapping };
      }
      setMappings(initialMappings);
      // Set the active tab to the first sheet
      setActiveSheet(Object.keys(analysis.sheets)[0]);
    }
  }, [show, analysis]);

  const handleMappingChange = (sheetName, dbField, excelColumnIndex) => {
    setMappings((prevMappings) => ({
      ...prevMappings,
      [sheetName]: {
        ...prevMappings[sheetName],
        [dbField]: excelColumnIndex === 'null' ? null : parseInt(excelColumnIndex, 10),
      },
    }));
  };

  const isConfirmDisabled = () => {
    if (!systemMappings || !activeSheet || !mappings[activeSheet]) {
      return true;
    }
    const currentSheetMappingConfig = systemMappings[activeSheet];
    if (!currentSheetMappingConfig) {
      // This can happen briefly during state updates, or if a sheet
      // from analysis somehow doesn't have a system mapping.
      return true;
    }
    const currentSheetUserMapping = mappings[activeSheet];

    for (const [dbField, config] of Object.entries(currentSheetMappingConfig)) {
      if (config.required && !currentSheetUserMapping[dbField]) {
        return true; // Disabled if a required field is not mapped
      }
    }
    return false;
  };

  if (!analysis || !systemMappings) {
    return null;
  }

  return (
    <Modal show={show} onHide={onCancel} size="xl" centered>
      <Modal.Header closeButton>
        <Modal.Title>مطابقة أعمدة الملف</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          قم بمراجعة الأعمدة التي تم اكتشافها في ملفك وقم بمطابقتها مع الحقول المطلوبة في النظام.
        </p>
        <Tab.Container activeKey={activeSheet} onSelect={(k) => setActiveSheet(k)}>
          <Nav variant="tabs" className="mb-3">
            {Object.keys(analysis.sheets).map((sheetName) => (
              <Nav.Item key={sheetName}>
                <Nav.Link eventKey={sheetName}>{sheetName}</Nav.Link>
              </Nav.Item>
            ))}
          </Nav>
          <Tab.Content>
            {Object.entries(analysis.sheets).map(([sheetName, sheetData]) => (
              <Tab.Pane key={sheetName} eventKey={sheetName}>
                {sheetData.warnings.length > 0 && (
                  <Alert variant="warning">
                    {sheetData.warnings.map((w, i) => (
                      <div key={i}>{w}</div>
                    ))}
                  </Alert>
                )}
                <Table striped bordered hover responsive>
                  <thead>
                    <tr>
                      <th>حقل النظام</th>
                      <th>العمود المطابق في ملفك</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemMappings[sheetName] &&
                      Object.entries(systemMappings[sheetName]).map(([dbField, config]) => (
                        <tr key={dbField}>
                          <td>
                            {config.aliases[0]}{' '}
                            {config.required && <Badge bg="danger">مطلوب</Badge>}
                          </td>
                          <td>
                            <Form.Select
                              value={mappings[sheetName]?.[dbField] || 'null'}
                              onChange={(e) =>
                                handleMappingChange(sheetName, dbField, e.target.value)
                              }
                            >
                              <option value="null">-- تجاهل هذا الحقل --</option>
                              {sheetData.headers.map((header) => (
                                <option key={header.index} value={header.index}>
                                  {header.value}
                                </option>
                              ))}
                            </Form.Select>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </Table>
              </Tab.Pane>
            ))}
          </Tab.Content>
        </Tab.Container>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel}>
          إلغاء
        </Button>
        <Button variant="primary" onClick={() => onConfirm(mappings)} disabled={isConfirmDisabled()}>
          تأكيد المطابقة والمتابعة
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ColumnMappingModal;
