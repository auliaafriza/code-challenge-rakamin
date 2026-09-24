import { Routes, Route, Navigate } from "react-router-dom";
import AssessorLayout from "@/components/layout/AssessorLayout";
import CandidateLayout from "@/components/layout/CandidateLayout";
import ProtectedRoute from "@/components/ProtectedRoute";
import LoginPage from "@/pages/auth/LoginPage";
import SignupPage from "@/pages/auth/SignupPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import CandidatesPage from "@/pages/candidates/CandidatesPage";
import AnalyticsPage from "@/pages/analytics/AnalyticsPage";
import AssessmentListPage from "@/pages/assessments/AssessmentListPage";
import AssessmentNewPage from "@/pages/assessments/AssessmentNewPage";
import AssessmentEditPage from "@/pages/assessments/AssessmentEditPage";
import AssessmentInvitePage from "@/pages/assessments/AssessmentInvitePage";
import LiveMonitorPage from "@/pages/monitor/LiveMonitorPage";
import PortfolioPage from "@/pages/portfolio/PortfolioPage";
import FitGapReportPage from "@/pages/fitgap/FitGapReportPage";
import TranscriptPage from "@/pages/transcript/TranscriptPage";
import VacancyListPage from "@/pages/vacancies/VacancyListPage";
import VacancyNewPage from "@/pages/vacancies/VacancyNewPage";
import VacancyEditPage from "@/pages/vacancies/VacancyEditPage";
import InterviewPage from "@/pages/interview/InterviewPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      <Route element={<ProtectedRoute />}>
      <Route element={<AssessorLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/assessments" element={<AssessmentListPage />} />
        <Route path="/assessments/new" element={<AssessmentNewPage />} />
        <Route path="/assessments/:id/edit" element={<AssessmentEditPage />} />
        <Route path="/assessments/:id/invite" element={<AssessmentInvitePage />} />
        <Route
          path="/assessments/:id/sessions/:sessionId/monitor"
          element={<LiveMonitorPage />}
        />
        <Route
          path="/assessments/:id/sessions/:sessionId/portfolio"
          element={<PortfolioPage />}
        />
        <Route
          path="/assessments/:id/sessions/:sessionId/transcript"
          element={<TranscriptPage />}
        />
        <Route
          path="/assessments/:id/sessions/:sessionId/fitgap/:vacancyId"
          element={<FitGapReportPage />}
        />
        <Route path="/vacancies" element={<VacancyListPage />} />
        <Route path="/vacancies/new" element={<VacancyNewPage />} />
        <Route path="/vacancies/:id/edit" element={<VacancyEditPage />} />
        <Route path="/candidates" element={<CandidatesPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
      </Route>
      </Route>

      <Route element={<CandidateLayout />}>
        <Route path="/interview/:token" element={<InterviewPage />} />
      </Route>
    </Routes>
  );
}
