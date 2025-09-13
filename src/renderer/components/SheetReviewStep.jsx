import React, { useState, useEffect } from 'react';
import { Button, ListGroup, Badge, Form, Alert } from 'react-bootstrap';

const SheetReviewStep = ({ analysis, columnMappings, onConfirm, onCancel }) => {
  const [sheetConfigs, setSheetConfigs] = useState({});

  useEffect(() => {
    if (analysis) {
      const initialConfigs = {};
      for (const sheetName in analysis.sheets) {
        const sheetData = analysis.sheets[sheetName];
        initialConfigs[sheetName] = {
          originalStatus: sheetData.status,
          currentType: sheetData.detectedType || null,
          isIgnored: false,
        };
      }
      setSheetConfigs(initialConfigs);
    }
  }, [analysis]);

  const handleTypeChange = (sheetName, newType) => {
    setSheetConfigs((prev) => ({
      ...prev,
      [sheetName]: {
        ...prev[sheetName],
        currentType: newType === 'null' ? null : newType,
      },
    }));
  };

  const handleIgnoreChange = (sheetName, isIgnored) => {
    setSheetConfigs((prev) => ({
      ...prev,
      [sheetName]: {
        ...prev[sheetName],
        isIgnored,
      },
    }));
  };

  const handleConfirm = () => {
    const confirmedMappings = {};
    for (const sheetName in sheetConfigs) {
      const config = sheetConfigs[sheetName];
      const sheetData = analysis.sheets[sheetName];

      if (config.isIgnored || !config.currentType) continue;

      // If the type was manually selected, the suggested mapping will be empty.
      // The column mapping modal will handle this.
      const suggestedMapping =
        sheetData.status === 'recognized' && sheetData.detectedType === config.currentType
          ? sheetData.suggestedMapping
          : {};

      confirmedMappings[sheetName] = {
        type: config.currentType,
        mapping: suggestedMapping,
        // Pass other necessary data to the next step
        headers: sheetData.headers,
        warnings: sheetData.warnings || [],
        rowCount: sheetData.rowCount,
      };
    }
    onConfirm(confirmedMappings);
  };

  const isConfirmDisabled = () => {
    return Object.values(sheetConfigs).some(
      (config) => !config.isIgnored && !config.currentType,
    );
  };

  if (!analysis) return null;

  return (
    <div>
      <Alert variant="info">
        <p>
          تم تحليل الملف. يرجى مراجعة الأوراق أدناه.
        </p>
        <p>
          إذا لم يتم التعرّف على إحدى الأوراق، يمكنك تحديد نوعها يدويًا أو تجاهلها.
        </p>
      </Alert>
      <ListGroup>
        {Object.entries(analysis.sheets).map(([sheetName, sheetData]) => (
          <ListGroup.Item key={sheetName}>
            <div className="d-flex justify-content-between align-items-center">
              <h5 className="mb-1">{sheetName}</h5>
              <Badge
                bg={sheetData.status === 'recognized' ? 'success' : 'warning'}
                pill
              >
                {sheetData.status === 'recognized' ? 'تم التعرّف عليه' : 'غير معروف'}
              </Badge>
            </div>

            {sheetData.status === 'unrecognized' && (
              <Alert variant="warning" className="mt-2">
                {sheetData.errorMessage}
              </Alert>
            )}

            <div className="d-flex align-items-center mt-2">
              <Form.Label className="me-2">نوع الاستيراد:</Form.Label>
              <Form.Select
                className="me-3"
                value={sheetConfigs[sheetName]?.currentType || 'null'}
                onChange={(e) => handleTypeChange(sheetName, e.target.value)}
                disabled={sheetConfigs[sheetName]?.isIgnored}
              >
                <option value="null">-- اختر النوع --</option>
                {Object.entries(columnMappings).map(([typeKey, config]) => (
                  <option key={typeKey} value={typeKey}>
                    {config.displayName}
                  </option>
                ))}
              </Form.Select>
              <Form.Check
                type="switch"
                id={`ignore-switch-${sheetName}`}
                label="تجاهل هذه الورقة"
                checked={sheetConfigs[sheetName]?.isIgnored || false}
                onChange={(e) => handleIgnoreChange(sheetName, e.target.checked)}
              />
            </div>
          </ListGroup.Item>
        ))}
      </ListGroup>
      <div className="mt-3 d-flex justify-content-end">
        <Button variant="secondary" onClick={onCancel} className="me-2">
          إلغاء
        </Button>
        <Button variant="primary" onClick={handleConfirm} disabled={isConfirmDisabled()}>
          متابعة إلى مطابقة الأعمدة
        </Button>
      </div>
    </div>
  );
};

export default SheetReviewStep;
