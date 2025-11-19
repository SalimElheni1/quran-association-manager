import React from 'react';
import { Modal, Button } from 'react-bootstrap';

/**
 * VoucherPrintModal - Print receipt or payment voucher
 * @param {boolean} show - Modal visibility
 * @param {Object} transaction - Transaction data
 * @param {Function} onHide - Close handler
 */
function VoucherPrintModal({ show, transaction, onHide }) {
  if (!transaction) return null;

  const isReceipt = transaction.type === 'INCOME';
  const title = isReceipt ? 'وصل استلام' : 'إذن بالدفع';

  const handlePrint = () => {
    window.print();
  };

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('ar-TN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('ar-TN');
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="voucher-print" style={{ padding: '20px', fontFamily: 'Arial' }}>
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <h3>{title}</h3>
            <p>رقم الوصل: {transaction.voucher_number}</p>
          </div>
          
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ padding: '10px', border: '1px solid #ddd', fontWeight: 'bold' }}>التاريخ:</td>
                <td style={{ padding: '10px', border: '1px solid #ddd' }}>{formatDate(transaction.transaction_date)}</td>
              </tr>
              <tr>
                <td style={{ padding: '10px', border: '1px solid #ddd', fontWeight: 'bold' }}>الفئة:</td>
                <td style={{ padding: '10px', border: '1px solid #ddd' }}>{transaction.category}</td>
              </tr>
              <tr>
                <td style={{ padding: '10px', border: '1px solid #ddd', fontWeight: 'bold' }}>المبلغ:</td>
                <td style={{ padding: '10px', border: '1px solid #ddd', fontSize: '18px', fontWeight: 'bold' }}>
                  {formatAmount(transaction.amount)} د.ت
                </td>
              </tr>
              <tr>
                <td style={{ padding: '10px', border: '1px solid #ddd', fontWeight: 'bold' }}>طريقة الدفع:</td>
                <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                  {(() => {
                    const method = transaction.payment_method?.toUpperCase();
                    switch (method) {
                      case 'CASH': return 'نقدي';
                      case 'CHECK': return 'شيك';
                      case 'TRANSFER': return 'تحويل بنكي';
                      default: return method || 'غير محدد';
                    }
                  })()}
                </td>
              </tr>
              {transaction.check_number && (
                <tr>
                  <td style={{ padding: '10px', border: '1px solid #ddd', fontWeight: 'bold' }}>رقم الشيك:</td>
                  <td style={{ padding: '10px', border: '1px solid #ddd' }}>{transaction.check_number}</td>
                </tr>
              )}
              {transaction.related_person_name && (
                <tr>
                  <td style={{ padding: '10px', border: '1px solid #ddd', fontWeight: 'bold' }}>
                    {isReceipt ? 'المستلم من:' : 'المدفوع إلى:'}
                  </td>
                  <td style={{ padding: '10px', border: '1px solid #ddd' }}>{transaction.related_person_name}</td>
                </tr>
              )}
              <tr>
                <td style={{ padding: '10px', border: '1px solid #ddd', fontWeight: 'bold' }}>البيان:</td>
                <td style={{ padding: '10px', border: '1px solid #ddd' }}>{transaction.description}</td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: '50px', display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ textAlign: 'center' }}>
              <p>التوقيع</p>
              <div style={{ borderTop: '1px solid #000', width: '150px', marginTop: '30px' }}></div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p>الختم</p>
              <div style={{ border: '1px solid #000', width: '100px', height: '100px', marginTop: '10px' }}></div>
            </div>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>إغلاق</Button>
        <Button variant="primary" onClick={handlePrint}>طباعة</Button>
      </Modal.Footer>
    </Modal>
  );
}

export default VoucherPrintModal;
