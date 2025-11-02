import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, Button } from 'react-bootstrap';
import onboardingContent from '@renderer/data/onboardingContent';
import { useAuth } from '@renderer/contexts/AuthContext';
import { toast } from 'react-toastify';

const routeToStep = (pathname) => {
  switch (true) {
    case pathname === '/' || pathname === '':
      return 1;
    case pathname.startsWith('/students'):
      return 2;
    case pathname.startsWith('/teachers'):
      return 3;
    case pathname.startsWith('/classes'):
      return 4;
    case pathname.startsWith('/attendance'):
      return 5;
    case pathname.startsWith('/financials'):
      return 6;
    case pathname.startsWith('/users'):
      return 7;
    case pathname.startsWith('/profile'):
      return 8;
    case pathname.startsWith('/settings'):
      return 9;
    case pathname.startsWith('/about'):
      return 10;
    default:
      return 0;
  }
};

const stepToRoute = (step) => {
  switch (step) {
    case 0:
      return '/';
    case 1:
      return '/';
    case 2:
      return '/students';
    case 3:
      return '/teachers';
    case 4:
      return '/classes';
    case 5:
      return '/attendance';
    case 6:
      return '/financials';
    case 7:
      return '/users';
    case 8:
      return '/profile';
    case 9:
      return '/settings';
    case 10:
      return '/about';
    default:
      return '/';
  }
};

function OnboardingGuide() {
  const location = useLocation();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [manualOpen, setManualOpen] = useState(null); // 'open' | 'begin' | null
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [orderedSteps, setOrderedSteps] = useState([0, 1, 2, 3, 4, 5, 8, 10]);

  // measure function reusable by multiple effects
  const measureSidebarWidth = () => {
    try {
      // look for common sidebar selectors (project uses .sidebar)
      const el = document.querySelector('.app-sidebar') || document.querySelector('.sidebar');
      if (el) {
        const rect = el.getBoundingClientRect();
        setSidebarWidth(Math.round(rect.width));
        return Math.round(rect.width);
      }
    } catch (e) {
      // ignore
    }
    setSidebarWidth(250);
    return 250;
  };

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const p = await window.electronAPI.getProfile({ token });
        setProfile(p);
      } catch (e) {
        // ignore; guide is optional
      }
    };
    fetchProfile();

    // Measure initial sidebar width and update on window resize
    measureSidebarWidth();
    window.addEventListener('resize', measureSidebarWidth);

    const handleOpen = (e) => {
      const detail = e?.detail || {};
      const action = detail.action;
      if (detail.profile) setProfile(detail.profile);
      if (action === 'open') {
        setManualOpen('open');
        setVisible(true);
      }
      if (action === 'open-begin') {
        setManualOpen('begin');
        setVisible(true);
        setStep(0);
      }
      // determine a target step from the event detail, falling back to provided profile or local profile
      const targetStep =
        typeof detail.current_step === 'number'
          ? detail.current_step
          : (detail.profile?.current_step ?? profile?.current_step);

      if (typeof targetStep === 'number') {
        setStep(targetStep);
        // If the user chose "Continue" (action === 'open') we should navigate the app to the
        // corresponding route so the sidebar shows the active tab for that step. Do not navigate
        // for the 'begin' action which intentionally starts at the intro (0).
        if (action === 'open' && targetStep !== 0) {
          try {
            navigate(stepToRoute(targetStep));
          } catch (err) {
            // navigation is best-effort; ignore if it fails in tests or unusual states
          }
        }
      }
      // NOTE: manualOpen is NOT auto-cleared here. It will be cleared when the user interacts
      // (Next/Previous/Exit) to avoid route-based overrides that move from step 0 to 1.
    };
    window.addEventListener('onboarding:open', handleOpen);
    return () => window.removeEventListener('onboarding:open', handleOpen);
  }, []);
  useEffect(() => {
    if (!user?.roles) return;

    const steps = [0, 1];
    const roles = user.roles;
    const hasRole = (r) => roles.includes(r);
    const hasAnyRole = (...r) => roles.some((role) => r.includes(role));

    if (hasAnyRole('Superadmin', 'Administrator', 'SessionSupervisor', 'FinanceManager'))
      steps.push(2);
    if (hasAnyRole('Superadmin', 'Administrator')) steps.push(3, 4, 5);
    if (hasAnyRole('Superadmin', 'Administrator', 'FinanceManager')) steps.push(6);
    if (hasRole('Superadmin')) steps.push(7, 9);
    steps.push(8, 10);

    setOrderedSteps(steps);
  }, [user?.roles]);

  if (!visible) return null;

  const content = onboardingContent[step] || onboardingContent[0];
  const totalSteps = orderedSteps.length;
  const currentIndex = Math.max(0, orderedSteps.indexOf(step));

  const handleExit = async () => {
    // user interacted: clear the manualOpen lock so route updates apply again
    setManualOpen(null);
    setVisible(false);
    if (profile && profile.id) {
      try {
        await window.electronAPI.updateUserGuide(profile.id, {
          need_guide: false,
          current_step: step,
        });
        setProfile({ ...profile, need_guide: false, current_step: step });
      } catch (e) {
        // ignore persistence failure
      }
    }
  };

  const handlePrevious = async () => {
    // user clicked: clear manualOpen so subsequent route changes behave normally
    setManualOpen(null);
    // find previous step in orderedSteps
    const idx = Math.max(0, orderedSteps.indexOf(step));
    const prev = idx > 0 ? orderedSteps[idx - 1] : orderedSteps[0];
    setStep(prev);
    if (profile && profile.id) {
      try {
        await window.electronAPI.updateUserGuide(profile.id, { current_step: prev });
      } catch (e) {
        // ignore
      }
    }
    // if prev is 0, do not force route change (stay on current page but show intro)
    if (prev === 0) return;
    navigate(stepToRoute(prev));
  };

  const handleNext = async () => {
    // user clicked: clear manualOpen so subsequent route changes behave normally
    setManualOpen(null);
    // step to the next entry in orderedSteps
    const idx = Math.max(0, orderedSteps.indexOf(step));
    const next =
      idx < orderedSteps.length - 1 ? orderedSteps[idx + 1] : orderedSteps[orderedSteps.length - 1];
    setStep(next);
    // persist is handled by the step effect above; if this is the last step, auto-close and disable guide
    if (idx >= orderedSteps.length - 1) {
      // close guide and mark as completed
      setVisible(false);
      if (profile && profile.id) {
        try {
          await window.electronAPI.updateUserGuide(profile.id, {
            current_step: next,
            need_guide: 0,
          });
          setProfile({ ...profile, need_guide: false, current_step: next });
        } catch (e) {
          // ignore
        }
      }
      // show a small toast notifying completion
      try {
        toast.info('تم إكمال دليل الإعداد. يمكنك تشغيله مرة أخرى من لوحة التحكم إذا رغبت.');
      } catch (e) {
        // ignore if toast is not available
      }
      return;
    }
    // navigate to a likely route for the next step (best-effort)
    navigate(stepToRoute(next));
  };

  return (
    <>
      {/* dim overlay but leave the right-side sidebar visible (RTL layout). */}
      {/* simple fade-in for overlay */}
      <style>{`
        @keyframes onboarding-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes onboarding-slide { from { transform: translateX(20px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        .onboarding-overlay { animation: onboarding-fade 240ms ease both; }
        .onboarding-guide { animation: onboarding-slide 260ms ease both; }
        .onboarding-progress { height: 6px; background: rgba(255,255,255,0.15); border-radius: 4px; overflow: hidden; }
        .onboarding-progress > i { display: block; height: 6px; background: linear-gradient(90deg,#0d6efd,#6610f2); width: 0%; }
      `}</style>
      <div
        className="onboarding-overlay"
        style={{
          position: 'fixed',
          top: 0,
          bottom: 0,
          left: 0,
          right: sidebarWidth, // leave the measured sidebar width visible
          background: 'rgba(0,0,0,0.55)',
          zIndex: 1040,
        }}
        aria-hidden="true"
      />

      {/* guide card on top of overlay, positioned adjacent to the right sidebar */}
      <Card
        className="onboarding-guide shadow-sm"
        style={{
          position: 'fixed',
          right: sidebarWidth + 20,
          top: 100,
          width: 420,
          zIndex: 1050,
        }}
      >
        <Card.Body>
          <div className="d-flex justify-content-between align-items-start">
            <Card.Title style={{ margin: 0 }}>{content.title}</Card.Title>
            <small style={{ opacity: 0.8 }}>
              {currentIndex + 1}/{totalSteps}
            </small>
          </div>
          <div className="mt-2 onboarding-progress">
            <i style={{ width: `${Math.round(((currentIndex + 1) / totalSteps) * 100)}%` }} />
          </div>
          {content.paragraphs.map((p, idx) => (
            <p key={idx} style={{ marginBottom: '0.6rem' }}>
              {p}
            </p>
          ))}
          <div className="d-flex justify-content-between mt-3">
            <div>
              <Button variant="secondary" size="sm" onClick={handlePrevious} className="me-2">
                السابق
              </Button>
              <Button variant="primary" size="sm" onClick={handleNext} className="me-2">
                التالي
              </Button>
            </div>
            <Button variant="outline-danger" size="sm" onClick={handleExit}>
              إيقاف العرض
            </Button>
          </div>
        </Card.Body>
      </Card>
    </>
  );
}

export default OnboardingGuide;
