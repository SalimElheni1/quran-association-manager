import React, { useState, useEffect } from 'react';
import { useAuth } from '@renderer/contexts/AuthContext';
import { Container, Row, Col, Card, Form, Button, Spinner, Alert } from 'react-bootstrap';
import { toast } from 'react-toastify';
import PasswordInput from '@renderer/components/PasswordInput';

const ProfilePage = () => {
  const { token } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // State for password change
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_new_password: '',
  });

  useEffect(() => {
    const fetchProfile = async () => {
      if (token) {
        try {
          const response = await window.electronAPI.getProfile({ token });
          if (response.success) {
            // Format date fields for input[type="date"]
            const formattedProfile = {
              ...response.profile,
              date_of_birth: response.profile.date_of_birth
                ? response.profile.date_of_birth.split('T')[0]
                : '',
              start_date: response.profile.start_date
                ? response.profile.start_date.split('T')[0]
                : '',
              end_date: response.profile.end_date ? response.profile.end_date.split('T')[0] : '',
            };
            setProfile(formattedProfile);
          } else {
            setError(response.message);
          }
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      }
    };

    fetchProfile();
  }, [token]);

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfile({ ...profile, [name]: value });
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData({ ...passwordData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Combine profile data with password data if a new password is being set
    const profileData = { ...profile };
    if (passwordData.new_password) {
      Object.assign(profileData, passwordData);
    }

    try {
      const response = await window.electronAPI.updateProfile({ token, profileData });
      if (response.success) {
        toast.success(response.message);
        // Clear password fields after successful submission
        setPasswordData({
          current_password: '',
          new_password: '',
          confirm_new_password: '',
        });
      } else {
        toast.error(response.message);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Container className="d-flex justify-content-center align-items-center vh-100">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Alert variant="danger">{error}</Alert>
      </Container>
    );
  }

  return (
    <Container fluid="lg" className="py-4">
      <Row className="justify-content-center">
        <Col lg={10}>
          <Card>
            <Card.Header as="h3" className="text-center bg-primary text-white">
              ملفي الشخصي
            </Card.Header>
            <Card.Body>
              <Form onSubmit={handleSubmit}>
                {/* Personal Information */}
                <Card className="mb-4">
                  <Card.Header>المعلومات الشخصية</Card.Header>
                  <Card.Body>
                    <Row>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>اسم المستخدم</Form.Label>
                          <Form.Control
                            type="text"
                            name="username"
                            value={profile.username || ''}
                            readOnly
                          />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>الدور</Form.Label>
                          <Form.Control
                            type="text"
                            name="role"
                            value={profile.role || ''}
                            readOnly
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                    <Row>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>الاسم الأول</Form.Label>
                          <Form.Control
                            type="text"
                            name="first_name"
                            value={profile.first_name || ''}
                            onChange={handleProfileChange}
                          />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>اللقب</Form.Label>
                          <Form.Control
                            type="text"
                            name="last_name"
                            value={profile.last_name || ''}
                            onChange={handleProfileChange}
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                    <Row>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>تاريخ الميلاد</Form.Label>
                          <Form.Control
                            type="date"
                            name="date_of_birth"
                            value={profile.date_of_birth || ''}
                            onChange={handleProfileChange}
                          />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>رقم ب.ت.و</Form.Label>
                          <Form.Control
                            type="text"
                            name="national_id"
                            value={profile.national_id || ''}
                            onChange={handleProfileChange}
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                    <Row>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>الحالة المدنية</Form.Label>
                          <Form.Select
                            name="civil_status"
                            value={profile.civil_status || ''}
                            onChange={handleProfileChange}
                          >
                            <option value="">اختر الحالة...</option>
                            <option value="Single">أعزب/عزباء</option>
                            <option value="Married">متزوج/متزوجة</option>
                            <option value="Divorced">مطلق/مطلقة</option>
                            <option value="Widowed">أرمل/أرملة</option>
                          </Form.Select>
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>المهنة</Form.Label>
                          <Form.Control
                            type="text"
                            name="occupation"
                            value={profile.occupation || ''}
                            onChange={handleProfileChange}
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>

                {/* Contact Information */}
                <Card className="mb-4">
                  <Card.Header>معلومات الاتصال</Card.Header>
                  <Card.Body>
                    <Row>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>البريد الإلكتروني</Form.Label>
                          <Form.Control
                            type="email"
                            name="email"
                            value={profile.email || ''}
                            onChange={handleProfileChange}
                          />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>رقم الهاتف</Form.Label>
                          <Form.Control
                            type="text"
                            name="phone_number"
                            value={profile.phone_number || ''}
                            onChange={handleProfileChange}
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>

                {/* Employment Information */}
                <Card className="mb-4">
                  <Card.Header>معلومات التوظيف</Card.Header>
                  <Card.Body>
                    <Row>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>طبيعة العمل</Form.Label>
                          <Form.Select
                            name="employment_type"
                            value={profile.employment_type || ''}
                            onChange={handleProfileChange}
                          >
                            <option value="">اختر...</option>
                            <option value="volunteer">متطوع</option>
                            <option value="contract">عقد</option>
                          </Form.Select>
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>الحالة</Form.Label>
                          <Form.Control
                            type="text"
                            name="status"
                            value={profile.status || ''}
                            readOnly
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                    <Row>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>تاريخ البداية</Form.Label>
                          <Form.Control
                            type="date"
                            name="start_date"
                            value={profile.start_date || ''}
                            onChange={handleProfileChange}
                          />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>تاريخ النهاية</Form.Label>
                          <Form.Control
                            type="date"
                            name="end_date"
                            value={profile.end_date || ''}
                            onChange={handleProfileChange}
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                    <Form.Group className="mb-3">
                      <Form.Label>ملاحظات</Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={3}
                        name="notes"
                        value={profile.notes || ''}
                        onChange={handleProfileChange}
                      />
                    </Form.Group>
                  </Card.Body>
                </Card>

                {/* Password Change */}
                <Card className="mb-4">
                  <Card.Header>تغيير كلمة المرور</Card.Header>
                  <Card.Body>
                    <Row>
                      <Col md={4}>
                        <PasswordInput
                          name="current_password"
                          value={passwordData.current_password}
                          onChange={handlePasswordChange}
                          placeholder="اترك الحقل فارغاً لعدم التغيير"
                          label="كلمة المرور الحالية"
                        />
                      </Col>
                      <Col md={4}>
                        <PasswordInput
                          name="new_password"
                          value={passwordData.new_password}
                          onChange={handlePasswordChange}
                          placeholder="أدخل كلمة المرور الجديدة"
                          label="كلمة المرور الجديدة"
                        />
                      </Col>
                      <Col md={4}>
                        <PasswordInput
                          name="confirm_new_password"
                          value={passwordData.confirm_new_password}
                          onChange={handlePasswordChange}
                          placeholder="أعد إدخال كلمة المرور الجديدة"
                          label="تأكيد كلمة المرور الجديدة"
                        />
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>

                <div className="d-grid">
                  <Button variant="primary" type="submit" size="lg" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Spinner
                          as="span"
                          animation="border"
                          size="sm"
                          role="status"
                          aria-hidden="true"
                        />
                        {' جارٍ الحفظ...'}
                      </>
                    ) : (
                      'حفظ التغييرات'
                    )}
                  </Button>
                </div>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default ProfilePage;
