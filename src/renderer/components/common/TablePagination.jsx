import React from 'react';
import { Button, Form } from 'react-bootstrap';

/**
 * Reusable pagination component for application tables
 * Supports page size selection, page navigation, and page info display
 */
function TablePagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  showPageSizeSelector = true,
  disabled = false,
}) {
  // Calculate start and end items for current page
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Don't render if there are no items to paginate
  if (totalItems === 0) return null;

  return (
    <div className="d-flex justify-content-between align-items-center mt-3">
      <div className="d-flex align-items-center gap-2">
        {showPageSizeSelector && (
          <>
            <Form.Label className="mb-0">عدد الصفوف:</Form.Label>
            <Form.Select
              value={pageSize}
              onChange={(e) => {
                const newPageSize = parseInt(e.target.value);
                onPageSizeChange?.(newPageSize, 1); // Reset to first page
              }}
              style={{ width: 'auto' }}
              disabled={disabled}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </Form.Select>
          </>
        )}
      </div>

      <div className="d-flex align-items-center gap-2">
        <span className="text-muted">
          عرض {startItem} إلى {endItem} من أصل {totalItems} عنصر
        </span>
      </div>

      <div className="d-flex gap-1">
        <Button
          variant="outline-primary"
          size="sm"
          disabled={currentPage === 1 || disabled}
          onClick={() => onPageChange(1)}
        >
          الأول
        </Button>
        <Button
          variant="outline-primary"
          size="sm"
          disabled={currentPage === 1 || disabled}
          onClick={() => onPageChange(currentPage - 1)}
        >
          السابق
        </Button>

        {/* Page numbers */}
        {(() => {
          const pages = [];
          const startPage = Math.max(1, currentPage - 2);
          const endPage = Math.min(totalPages, currentPage + 2);

          for (let i = startPage; i <= endPage; i++) {
            pages.push(
              <Button
                key={i}
                variant={i === currentPage ? 'primary' : 'outline-primary'}
                size="sm"
                onClick={() => onPageChange(i)}
                disabled={disabled}
              >
                {i}
              </Button>,
            );
          }

          return pages;
        })()}

        <Button
          variant="outline-primary"
          size="sm"
          disabled={currentPage === totalPages || disabled}
          onClick={() => onPageChange(currentPage + 1)}
        >
          التالي
        </Button>
        <Button
          variant="outline-primary"
          size="sm"
          disabled={currentPage === totalPages || disabled}
          onClick={() => onPageChange(totalPages)}
        >
          الأخير
        </Button>
      </div>
    </div>
  );
}

export default TablePagination;
