export default function Help() {
  return (
    <div className="page-content">
      <h1>Help & Documentation</h1>

      <section className="card">
        <h2>Quick Start Guide</h2>
        <ol>
          <li>
            <strong>Configure Database</strong>
            <p>Go to Settings and configure your MySQL database connection.</p>
          </li>
          <li>
            <strong>Upload a Project</strong>
            <p>Use Upload Project to add your code project (folder, ZIP, or files).</p>
          </li>
          <li>
            <strong>Configure Test Run</strong>
            <p>Select the project and choose which test suites to run.</p>
          </li>
          <li>
            <strong>Monitor & Download</strong>
            <p>Watch test progress in real-time and download reports when complete.</p>
          </li>
        </ol>
      </section>

      <section className="card">
        <h2>Supported Testing Frameworks</h2>

        <div className="framework-list">
          <div className="framework-item">
            <h3>Jest</h3>
            <p>Unit testing and white-box testing for JavaScript/Node.js projects</p>
            <p className="small">Generates JUnit XML reports with coverage information</p>
          </div>

          <div className="framework-item">
            <h3>Newman</h3>
            <p>Postman collection runner for API and integration testing</p>
            <p className="small">Tests REST APIs with request/response validation</p>
          </div>

          <div className="framework-item">
            <h3>Playwright</h3>
            <p>Browser-based testing for web applications (black-box testing)</p>
            <p className="small">Supports Chromium, Firefox, and WebKit browsers</p>
          </div>

          <div className="framework-item">
            <h3>JMeter</h3>
            <p>Performance and load testing for backend services</p>
            <p className="small">Measures latency, throughput, and error rates</p>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Features</h2>
        <ul>
          <li>📁 Upload projects via folder, ZIP, or individual files</li>
          <li>⚡ One-click execution of multiple test suites</li>
          <li>📺 Real-time test output streaming via live logs</li>
          <li>📊 Automated test report generation</li>
          <li>💾 Download complete report packages as ZIP</li>
          <li>🔄 CI/CD integration via GitHub Actions</li>
          <li>📱 Responsive design for all devices</li>
        </ul>
      </section>

      <section className="card">
        <h2>Keyboard Shortcuts</h2>
        <table>
          <tbody>
            <tr>
              <td>
                <kbd>D</kbd>
              </td>
              <td>Go to Dashboard</td>
            </tr>
            <tr>
              <td>
                <kbd>U</kbd>
              </td>
              <td>Go to Upload</td>
            </tr>
            <tr>
              <td>
                <kbd>T</kbd>
              </td>
              <td>Go to Test Runs</td>
            </tr>
            <tr>
              <td>
                <kbd>S</kbd>
              </td>
              <td>Go to Settings</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>FAQ</h2>

        <details>
          <summary>How do I use folder upload?</summary>
          <p>Click "Upload Project" and select "Full Folder". Your browser will prompt you to select a folder. All files inside will be uploaded.</p>
        </details>

        <details>
          <summary>Can I customize which tests run?</summary>
          <p>Yes! When starting a test run, you can check/uncheck each testing framework (Jest, Newman, Playwright, JMeter).</p>
        </details>

        <details>
          <summary>Where are test results stored?</summary>
          <p>Results are stored in your MySQL database and in the backend storage directory. You can download complete reports from run details.</p>
        </details>

        <details>
          <summary>How do I integrate with CI/CD?</summary>
          <p>The project includes a GitHub Actions workflow file. Push to your repo and configure the workflow environment variables.</p>
        </details>

        <details>
          <summary>What if JMeter isn't installed?</summary>
          <p>JMeter is optional - if not installed, the test run will complete other frameworks and skip JMeter with a warning.</p>
        </details>
      </section>
    </div>
  );
}
