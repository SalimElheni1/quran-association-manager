import React from 'react';
import { Modal, Button } from 'react-bootstrap';
import PrintIcon from '@renderer/components/icons/PrintIcon';
import '@renderer/styles/VoucherPrintModal.css';

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
  const voucherNumber = transaction.voucher_number || transaction.receipt_number || '-';

  const handlePrint = () => {
    window.print();
  };

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('ar-TN', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(amount);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('ar-TN');
  };

  const paymentMethodLabels = {
    CASH: 'نقدي',
    CHECK: 'شيك',
    TRANSFER: 'تحويل بنكي',
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="voucher-print">
          <div className="voucher-head">
            <h3 className="voucher-title">{title}</h3>
            <p className="voucher-number">رقم الوصل: {voucherNumber}</p>
          </div>

          <table className="voucher-table">
            <tbody>
              <tr>
                <th>التاريخ:</th>
                <td>{formatDate(transaction.transaction_date || transaction.payment_date)}</td>
              </tr>
              <tr>
                <th>الفئة:</th>
                <td>{transaction.category || transaction.category_name || 'رسوم الطلاب'}</td>
              </tr>
              <tr>
                <th>المبلغ:</th>
                <td className="voucher-amount">{formatAmount(transaction.amount)} د.ت</td>
              </tr>
              <tr>
                <th>طريقة الدفع:</th>
                <td>
                  {paymentMethodLabels[transaction.payment_method?.toUpperCase()] ||
                    transaction.payment_method ||
                    'غير محدد'}
                </td>
              </tr>
              {transaction.check_number && (
                <tr>
                  <th>رقم الشيك:</th>
                  <td>{transaction.check_number}</td>
                </tr>
              )}
              {transaction.related_person_name && (
                <tr>
                  <th>{isReceipt ? 'المستلم من:' : 'المدفوع إلى:'}</th>
                  <td>{transaction.related_person_name}</td>
                </tr>
              )}
              <tr>
                <th>البيان:</th>
                <td>{transaction.description || transaction.notes || '-'}</td>
              </tr>
            </tbody>
          </table>

          <div className="voucher-signatures">
            <div className="voucher-signature">
              <p>التوقيع</p>
              <div className="voucher-signature-line"></div>
            </div>
            <div className="voucher-signature">
              <p>الختم</p>
              <div className="voucher-stamp"></div>
            </div>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          إغلاق
        </Button>
        <Button variant="primary" onClick={handlePrint}>
          <PrintIcon width={18} height={18} className="ms-1" /> طباعة
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default VoucherPrintModal;
