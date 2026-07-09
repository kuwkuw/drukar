import { Landing } from './components/Landing';
import { Workbench } from './components/Workbench';
import { useRoute } from './hooks/useRoute';

export function App() {
  const route = useRoute();
  return route === 'workbench' ? <Workbench /> : <Landing />;
}
