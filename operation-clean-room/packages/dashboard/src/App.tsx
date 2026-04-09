import { Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/layout/Shell';
import { RevenueSummary } from './components/features/RevenueSummary';
import { DiscrepancyTable } from './components/features/DiscrepancyTable';
import { CohortAnalysis } from './components/features/CohortAnalysis';
import { CustomerHealth } from './components/features/CustomerHealth';
import { PipelineQuality } from './components/features/PipelineQuality';
import { ScenarioModeler } from './components/features/ScenarioModeler';
import { AuditTrail } from './components/features/AuditTrail';

export function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/revenue" replace />} />
        <Route path="/revenue" element={<RevenueSummary />} />
        <Route path="/discrepancies" element={<DiscrepancyTable />} />
        <Route path="/cohorts" element={<CohortAnalysis />} />
        <Route path="/health" element={<CustomerHealth />} />
        <Route path="/pipeline" element={<PipelineQuality />} />
        <Route path="/scenarios" element={<ScenarioModeler />} />
        <Route path="/audit" element={<AuditTrail />} />
      </Routes>
    </Shell>
  );
}
