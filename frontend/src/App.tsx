/** Main App component */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DriveVisualizer } from './components/DriveVisualizer';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DriveVisualizer />
    </QueryClientProvider>
  );
}

export default App;






