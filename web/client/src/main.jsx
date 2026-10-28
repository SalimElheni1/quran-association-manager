// One entry for the whole site; each address loads only its own part:
//   /b/<branch>/      the branch app (the desktop renderer)
//   /platform         the platform console
//   /invite/<token>   accepting an invitation
//   /                 the home page (go to a branch)

const path = window.location.pathname;
const branchMatch = /^\/b\/([a-z0-9-]+)(\/|$)/.exec(path);

if (branchMatch) {
  import('./branch/startBranchApp').then((m) => m.start(branchMatch[1]));
} else if (path === '/platform' || path.startsWith('/platform/')) {
  import('./platform/startPlatform').then((m) => m.start());
} else if (path.startsWith('/invite/')) {
  import('./invite/startInvite').then((m) =>
    m.start(decodeURIComponent(path.slice('/invite/'.length))),
  );
} else {
  import('./common/startHome').then((m) => m.start());
}
