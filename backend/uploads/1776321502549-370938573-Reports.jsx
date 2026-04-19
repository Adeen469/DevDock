export default function Reports() {
  return (
    <div className="page-content">
      <h1>Test Reports</h1>

      <section className="card">
        <h2>Reports Overview</h2>
        <p>
          Test reports are generated for each test run and include detailed results from all testing frameworks:
        </p>

        <div className="reports-grid">
          <div className="report-card">
            <h3>Jest</h3>
            <p>Unit & White-Box Tests</p>
            <p className="small">JUnit XML reports with code coverage details</p>
          </div>

          <div className="report-card">
            <h3>Newman</h3>
            <p>API Integration Tests</p>
            <p className="small">Postman collection results with request/response data</p>
          </div>

          <div className="report-card">
            <h3>Playwright</h3>
            <p>UI/Black-Box Tests</p>
            <p className="small">Browser automation tests with screenshots and videos</p>
          </div>

          <div className="report-card">
            <h3>JMeter</h3>
            <p>Performance Tests</p>
            <p className="small">Load test results with latency, throughput, and error rates</p>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Download Reports</h2>
        <p>Each test run generates a complete report package that can be downloaded as a ZIP file.</p>
        <p>To download reports:</p>
        <ol>
          <li>Go to <strong>Test History</strong></li>
          <li>Click <strong>Details</strong> on any completed run</li>
          <li>Click <strong>⬇ Download Test Reports</strong></li>
          <li>Extract the ZIP to view all reports</li>
        </ol>
      </section>

      <section className="card">
        <h2>Report Structure</h2>
        <p>Downloaded report packages contain:</p>
        <ul>
          <li><code>jest/</code> - Jest unit test results (JUnit XML)</li>
          <li><code>newman/</code> - Newman API test results (XML + HTML)</li>
          <li><code>playwright/</code> - Playwright UI test results (JUnit XML)</li>
          <li><code>jmeter/</code> - JMeter performance test results (JTL + HTML)</li>
        </ul>
      </section>
    </div>
  );
}
