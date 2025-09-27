import React, { useState, useEffect } from 'react';
import { Modal, Button, ProgressBar, Alert } from 'react-bootstrap';
import ImportStep from './ImportStep';

function ImportWizard({ show, handleClose, selectedSheets = [] }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [steps, setSteps] = useState([]);
  const [stepResults, setStepResults] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (show) {
      loadSteps();
    }
  }, [show]);

  const loadSteps = async () => {
    try {
      const result = await window.electronAPI.getImportSteps();
      if (result.success) {
        // Filter and create dynamic steps based on selected sheets
        const dynamicSteps = createDynamicSteps(result.data, selectedSheets);
        setSteps(dynamicSteps);
      }
    } catch (error) {
      console.error('Failed to load import steps:', error);
    }
  };

  const createDynamicSteps = (allSteps, selectedSheets) => {
    if (!selectedSheets || selectedSheets.length === 0) {
      return allSteps; // Return all steps if no selection
    }

    const dynamicSteps = [];
    let stepOrder = 1;

    // Step 1: Basic Data (if any basic sheets are selected)
    const basicSheets = ['الطلاب', 'المعلمون', 'المستخدمون', 'المجموعات', 'المخزون'];
    const selectedBasicSheets = selectedSheets.filter(sheet => basicSheets.includes(sheet));
    
    if (selectedBasicSheets.length > 0) {
      dynamicSteps.push({
        id: 'step1',
        name: 'البيانات الأساسية',
        description: `استيراد ${selectedBasicSheets.join('، ')}`,
        sheets: selectedBasicSheets,
        order: stepOrder++,
        icon: 'fas fa-users'
      });
    }

    // Step 2: Financial Data (if any financial sheets are selected)
    const financialSheets = ['التبرعات', 'المصاريف'];
    const selectedFinancialSheets = selectedSheets.filter(sheet => financialSheets.includes(sheet));
    
    if (selectedFinancialSheets.length > 0) {
      dynamicSteps.push({
        id: 'step2',
        name: 'البيانات المالية',
        description: `استيراد ${selectedFinancialSheets.join('، ')}`,
        sheets: selectedFinancialSheets,
        order: stepOrder++,
        icon: 'fas fa-coins',
        dependencies: selectedBasicSheets.length > 0 ? ['step1'] : []
      });
    }

    return dynamicSteps;
  };

  const handleStepComplete = (stepId, result) => {
    setStepResults(prev => ({ ...prev, [stepId]: result }));
    
    // Move to next step if successful
    if (result.success && currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleFinish = () => {
    setCurrentStep(1);
    setStepResults({});
    handleClose();
  };

  const getCurrentStepData = () => {
    return steps.find(step => step.order === currentStep);
  };

  const isStepCompleted = (stepOrder) => {
    const step = steps.find(s => s.order === stepOrder);
    return step && stepResults[step.id]?.success;
  };

  const canProceedToNext = () => {
    return isStepCompleted(currentStep);
  };

  const isLastStep = () => {
    return currentStep === steps.length;
  };

  const allStepsCompleted = () => {
    return steps.every(step => stepResults[step.id]?.success);
  };

  return (
    <Modal show={show} onHide={handleClose} size="lg" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>
          <i className="fas fa-magic me-2"></i>
          معالج استيراد البيانات
          {selectedSheets.length > 0 && (
            <span className="badge bg-primary ms-2">{selectedSheets.length} ورقة</span>
          )}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {steps.length > 0 && (
          <>
            {/* Progress Bar */}
            <div className="mb-4">
              <div className="d-flex justify-content-between align-items-center mb-3">
                {steps.map((step, index) => (
                  <div key={step.id} className="text-center flex-fill">
                    <div className="d-flex align-items-center justify-content-center">
                      <div 
                        className={`rounded-circle d-inline-flex align-items-center justify-content-center border-2 ${
                          step.order === currentStep 
                            ? 'bg-primary text-white border-primary' 
                            : isStepCompleted(step.order)
                            ? 'bg-success text-white border-success'
                            : 'bg-white text-muted border-light'
                        }`}
                        style={{ width: '50px', height: '50px', fontSize: '1.2rem' }}
                      >
                        {isStepCompleted(step.order) ? (
                          <i className="fas fa-check"></i>
                        ) : (
                          <i className={step.icon || 'fas fa-file-excel'}></i>
                        )}
                      </div>
                      {index < steps.length - 1 && (
                        <div 
                          className={`flex-fill mx-2 ${
                            isStepCompleted(step.order) ? 'border-success' : 'border-light'
                          }`}
                          style={{ height: '2px', borderTop: '2px solid' }}
                        ></div>
                      )}
                    </div>
                    <div className={`small mt-2 fw-medium ${
                      step.order === currentStep ? 'text-primary' : 
                      isStepCompleted(step.order) ? 'text-success' : 'text-muted'
                    }`}>
                      {step.name}
                    </div>
                  </div>
                ))}
              </div>
              <ProgressBar 
                now={(Object.keys(stepResults).length / steps.length) * 100} 
                variant={allStepsCompleted() ? 'success' : 'primary'}
                style={{ height: '8px' }}
              />
            </div>

            {/* Current Step */}
            {getCurrentStepData() && (
              <ImportStep
                step={getCurrentStepData()}
                onComplete={handleStepComplete}
                result={stepResults[getCurrentStepData().id]}
                disabled={loading}
              />
            )}

            {/* Results Summary */}
            {Object.keys(stepResults).length > 0 && (
              <div className="mt-4">
                <h6>ملخص النتائج:</h6>
                {steps.map(step => {
                  const result = stepResults[step.id];
                  if (!result) return null;
                  
                  return (
                    <Alert 
                      key={step.id}
                      variant={result.success ? 'success' : 'danger'}
                      className="py-2"
                    >
                      <strong>{step.name}:</strong> {' '}
                      {result.success 
                        ? `تم بنجاح - ${result.data?.successCount || 0} سجل`
                        : `فشل - ${result.message}`
                      }
                    </Alert>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button 
          variant="secondary" 
          onClick={handlePrevious}
          disabled={currentStep === 1 || loading}
        >
          السابق
        </Button>
        
        {!isLastStep() ? (
          <Button 
            variant="primary" 
            onClick={handleNext}
            disabled={!canProceedToNext() || loading}
          >
            التالي
          </Button>
        ) : (
          <Button 
            variant="success" 
            onClick={handleFinish}
            disabled={!allStepsCompleted()}
          >
            إنهاء
          </Button>
        )}
        
        <Button variant="outline-secondary" onClick={handleClose}>
          إغلاق
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default ImportWizard;