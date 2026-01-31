import { Router, Route } from '@solidjs/router'
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/Toast'
import { Dashboard } from './pages/Dashboard'
import { Strategies } from './pages/Strategies'
import { Backtest } from './pages/Backtest'
import { Simulation } from './pages/Simulation'
import { Dataset } from './pages/Dataset'
import { Screening } from './pages/Screening'
import { MLTraining } from './pages/MLTraining'
import { TradingJournal } from './pages/TradingJournal'
import { Settings } from './pages/Settings'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      refetchOnWindowFocus: false,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Router root={Layout}>
          <Route path="/" component={Dashboard} />
          <Route path="/strategies" component={Strategies} />
          <Route path="/backtest" component={Backtest} />
          <Route path="/simulation" component={Simulation} />
          <Route path="/dataset" component={Dataset} />
          <Route path="/screening" component={Screening} />
          <Route path="/ml-training" component={MLTraining} />
          <Route path="/journal" component={TradingJournal} />
          <Route path="/settings" component={Settings} />
        </Router>
      </ToastProvider>
    </QueryClientProvider>
  )
}

export default App
