import React from 'react';
import { Row, Col, Form, InputGroup } from 'react-bootstrap';
import SearchIcon from '@renderer/components/icons/SearchIcon';
import { useCategories } from '@renderer/hooks/useCategories';

function TransactionFilters({ type, filters, onChange }) {
  const { categories } = useCategories(type);

  const handleChange = (field, value) => {
    onChange({ ...filters, [field]: value });
  };

  return (
    <div className="filter-bar grid-layout mb-3 w-100">
      <Row className="g-2 align-items-center">
        <Col xs={12} md={5} lg={4}>
          <InputGroup className="search-input-group">
            <InputGroup.Text>
              <SearchIcon />
            </InputGroup.Text>
            <Form.Control
              type="search"
              placeholder="البحث..."
              value={filters.searchTerm || ''}
              onChange={(e) => handleChange('searchTerm', e.target.value)}
            />
          </InputGroup>
        </Col>

        <Col xs={12} md={3} lg={3}>
          <Form.Select
            value={filters.category || ''}
            onChange={(e) => handleChange('category', e.target.value)}
            className="filter-select"
          >
            <option value="">كل الفئات</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.name}>
                {cat.name}
              </option>
            ))}
          </Form.Select>
        </Col>

        <Col xs={6} md={2} lg={2}>
          <Form.Control
            type="date"
            value={filters.startDate || ''}
            onChange={(e) => handleChange('startDate', e.target.value)}
            placeholder="من تاريخ"
          />
        </Col>

        <Col xs={6} md={2} lg={3}>
          <Form.Control
            type="date"
            value={filters.endDate || ''}
            onChange={(e) => handleChange('endDate', e.target.value)}
            placeholder="إلى تاريخ"
          />
        </Col>
      </Row>
    </div>
  );
}

export default TransactionFilters;
