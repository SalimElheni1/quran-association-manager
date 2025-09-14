import React, { useState, useEffect, useCallback } from 'react';
import { Container, Table, Button, Alert, Card, Pagination, Badge } from 'react-bootstrap';
import { error as logError } from '@renderer/utils/logger';

function HistoryPage() {
  const [history, setHistory] = useState([]);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0 });
  const [searchTerm, setSearchTerm] = useState('');

  const fetchHistory = useCallback(async (page = 1, search = searchTerm) => {
    setIsLoading(true);
    // The backend handler needs to be updated to handle a search term.
    // For now, we'll assume it exists and filter on the client side as a placeholder.
    // This is a limitation to be addressed later.
    const result = await window.electronAPI.getExportHistory({ page, limit: pagination.limit });
    if (result.success) {
      setHistory(result.data.history);
      setPagination({
        page: result.data.page,
        limit: result.data.limit,
        total: result.data.total,
      });
    } else {
      setMessage({ type: 'danger', text: result.message || 'Failed to fetch history.' });
    }
    setIsLoading(false);
  }, [pagination.limit]);

  useEffect(() => {
    fetchHistory(1);
  }, [fetchHistory]);

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this history record?')) {
      const result = await window.electronAPI.deleteExportHistory(id);
      if (result.success) {
        setMessage({ type: 'success', text: 'Record deleted successfully.' });
        fetchHistory(pagination.page); // Refresh the current page
      } else {
        setMessage({ type: 'danger', text: result.message || 'Failed to delete record.' });
      }
    }
  };

  const handleRegenerate = async (id) => {
    setMessage({ type: 'info', text: 'Re-generating export... Please wait.' });
    const result = await window.electronAPI.regenerateExport(id);
    if (result.success) {
      setMessage({ type: 'success', text: result.message });
    } else {
      setMessage({ type: 'danger', text: result.message || 'Failed to re-generate export.' });
    }
  };

  const totalPages = Math.ceil(pagination.total / pagination.limit);

  return (
    <Container className="page-container">
      <div className="page-header">
        <h1>Export History</h1>
        <p className="lead">A log of all past export operations.</p>
      </div>

      {message.text && <Alert variant={message.type}>{message.text}</Alert>}

      <Card>
        <Card.Body>
          <Table striped bordered hover responsive>
            <thead>
              <tr>
                <th>Type</th>
                <th>Format</th>
                <th>Status</th>
                <th>Rows</th>
                <th>Date</th>
                <th>File Path</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="7" className="text-center">Loading...</td></tr>
              ) : (
                history.map((item) => (
                  <tr key={item.id}>
                    <td>{item.export_type}</td>
                    <td><Badge bg="secondary">{item.format}</Badge></td>
                    <td>
                        <Badge bg={item.status === 'Success' ? 'success' : 'danger'}>
                            {item.status}
                        </Badge>
                    </td>
                    <td>{item.row_count}</td>
                    <td>{new Date(item.created_at).toLocaleString()}</td>
                    <td title={item.file_path}>{item.file_path ? '...' + item.file_path.slice(-50) : 'N/A'}</td>
                    <td>
                      <Button
                        variant="info"
                        size="sm"
                        className="ms-2"
                        onClick={() => handleRegenerate(item.id)}
                      >
                        Re-generate
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(item.id)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>

          {totalPages > 1 && (
            <Pagination>
              <Pagination.Prev onClick={() => fetchHistory(pagination.page - 1)} disabled={pagination.page <= 1} />
              {[...Array(totalPages).keys()].map(num => (
                <Pagination.Item key={num + 1} active={num + 1 === pagination.page} onClick={() => fetchHistory(num + 1)}>
                  {num + 1}
                </Pagination.Item>
              ))}
              <Pagination.Next onClick={() => fetchHistory(pagination.page + 1)} disabled={pagination.page >= totalPages} />
            </Pagination>
          )}

        </Card.Body>
      </Card>
    </Container>
  );
}

export default HistoryPage;
