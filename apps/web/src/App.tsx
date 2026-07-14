import { Dashboard } from './components/Dashboard';
import { Landing } from './components/Landing';
import { Workbench } from './components/Workbench';
import { useRoute } from './hooks/useRoute';

export function App() {
  const route = useRoute();
  if (route === 'workbench') return <Workbench />;
  if (route === 'dashboard') return <Dashboard />;
  return <Landing />;
}
