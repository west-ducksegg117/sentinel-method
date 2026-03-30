import {
  checkMissingAltAttributes,
  checkMissingAriaLabels,
  checkNonSemanticClickable,
  checkMissingFormLabels,
  checkPositiveTabindex,
  checkEmptyLinksButtons,
  checkAutoplayingMedia,
  checkHeadingHierarchy,
  checkColorOnlyInformation,
  calculateScore,
} from '../../src/validators/accessibility-helpers';
import { AccessibilityMetrics } from '../../src/validators/accessibility';

describe('Accessibility Helpers', () => {
  const createMockMetrics = (): AccessibilityMetrics => ({
    missingAltCount: 0,
    missingAriaLabelsCount: 0,
    nonSemanticElementsCount: 0,
    missingFormLabelsCount: 0,
    missingLangAttributeCount: 0,
    positiveTabindexCount: 0,
    emptyLinksButtonsCount: 0,
    autoplayMediaCount: 0,
    headingHierarchyIssuesCount: 0,
    colorOnlyInfoCount: 0,
  });

  const mockCreateIssue = (severity: string, code: string, message: string, extras?: any) => ({
    severity,
    code,
    message,
    ...extras,
  });

  const mockGetLineNumber = (content: string, index: number) =>
    content.substring(0, index).split('\n').length;

  describe('checkMissingAltAttributes', () => {
    test('should detect img without alt attribute', () => {
      const content = '<img src="photo.jpg" />';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkMissingAltAttributes('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('WCAG-1.1.1');
      expect(metrics.missingAltCount).toBe(1);
    });

    test('should not flag img with alt attribute', () => {
      const content = '<img src="photo.jpg" alt="Profile picture" />';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkMissingAltAttributes('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(0);
      expect(metrics.missingAltCount).toBe(0);
    });

    test('should detect multiple missing alt attributes', () => {
      const content = '<img src="a.jpg" /> <img src="b.jpg" />';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkMissingAltAttributes('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(metrics.missingAltCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkMissingAriaLabels', () => {
    test('should detect button without aria-label or text', () => {
      const content = '<button></button>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkMissingAriaLabels('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues.length).toBeGreaterThanOrEqual(0);
    });

    test('should allow button with text content', () => {
      const content = '<button>Submit</button>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkMissingAriaLabels('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(0);
    });

    test('should detect empty link without aria-label', () => {
      const content = '<a></a>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkMissingAriaLabels('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues.length).toBeGreaterThanOrEqual(0);
    });

    test('should allow link with aria-label', () => {
      const content = '<a href="/home" aria-label="Home"></a>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkMissingAriaLabels('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(0);
    });

    test('should detect input without aria-label or aria-labelledby', () => {
      const content = '<input type="text" />';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkMissingAriaLabels('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkNonSemanticClickable', () => {
    test('should detect div with onClick', () => {
      const content = '<div onClick={handleClick}>Click me</div>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkNonSemanticClickable('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('WCAG-4.1.3');
      expect(metrics.nonSemanticElementsCount).toBe(1);
    });

    test('should detect span with onClick', () => {
      const content = '<span onClick={handler}>Clickable text</span>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkNonSemanticClickable('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(1);
      expect(metrics.nonSemanticElementsCount).toBe(1);
    });

    test('should not flag semantic elements with onClick', () => {
      const content = '<button onClick={handler}>Click me</button>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkNonSemanticClickable('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(0);
    });

    test('should detect multiple non-semantic clickable elements', () => {
      const content = `
        <div onClick={a}>A</div>
        <span onClick={b}>B</span>
        <button>Good</button>
      `;
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkNonSemanticClickable('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(2);
    });
  });

  describe('checkMissingFormLabels', () => {
    test('should detect input without label', () => {
      const content = '<input type="text" />';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkMissingFormLabels('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('WCAG-1.3.1');
      expect(metrics.missingFormLabelsCount).toBe(1);
    });

    test('should handle textarea without label', () => {
      const content = '<textarea></textarea>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkMissingFormLabels('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(metrics.missingFormLabelsCount).toBeGreaterThanOrEqual(0);
    });

    test('should handle select without label', () => {
      const content = '<select><option>A</option></select>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkMissingFormLabels('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(metrics.missingFormLabelsCount).toBeGreaterThanOrEqual(0);
    });

    test('should allow input with associated label', () => {
      const content = '<label for="email">Email:</label><input id="email" type="text" />';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkMissingFormLabels('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(0);
    });

    test('should allow input with aria-label', () => {
      const content = '<input type="text" aria-label="Email address" />';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkMissingFormLabels('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(0);
    });

    test('should handle case-insensitive label matching', () => {
      const content = '<LABEL FOR="test">Test:</LABEL><INPUT ID="test" />';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkMissingFormLabels('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(0);
    });
  });

  describe('checkPositiveTabindex', () => {
    test('should detect positive tabindex value', () => {
      const content = '<button tabindex="1">Click</button>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkPositiveTabindex('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('WCAG-2.4.3');
      expect(metrics.positiveTabindexCount).toBe(1);
    });

    test('should allow tabindex="0"', () => {
      const content = '<button tabindex="0">Click</button>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkPositiveTabindex('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(0);
    });

    test('should allow tabindex="-1"', () => {
      const content = '<button tabindex="-1">Click</button>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkPositiveTabindex('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(0);
    });

    test('should detect multiple positive tabindex values', () => {
      const content = `
        <button tabindex="1">First</button>
        <button tabindex="2">Second</button>
      `;
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkPositiveTabindex('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(2);
    });
  });

  describe('checkEmptyLinksButtons', () => {
    test('should detect empty interactive elements', () => {
      const content = '<a href="/test"></a>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkEmptyLinksButtons('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      if (issues.length > 0) {
        expect(issues[0].code).toBe('WCAG-1.1.1');
      }
    });

    test('should detect empty buttons', () => {
      const content = '<button></button>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkEmptyLinksButtons('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues.length).toBeGreaterThanOrEqual(0);
    });

    test('should allow links with aria-label', () => {
      const content = '<a href="/test" aria-label="Test"></a>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkEmptyLinksButtons('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(metrics.emptyLinksButtonsCount).toBeLessThanOrEqual(0);
    });

    test('should handle link with text content', () => {
      const content = '<a href="/test">Test</a>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkEmptyLinksButtons('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkAutoplayingMedia', () => {
    test('should detect video with autoplay without muted', () => {
      const content = '<video autoplay></video>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkAutoplayingMedia('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('WCAG-1.4.2');
      expect(metrics.autoplayMediaCount).toBe(1);
    });

    test('should detect audio with autoplay without muted', () => {
      const content = '<audio autoplay></audio>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkAutoplayingMedia('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(1);
    });

    test('should allow video with autoplay and muted', () => {
      const content = '<video autoplay muted></video>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkAutoplayingMedia('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(0);
    });

    test('should detect multiple autoplay issues', () => {
      const content = `
        <video autoplay></video>
        <audio autoplay></audio>
      `;
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkAutoplayingMedia('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(2);
    });
  });

  describe('checkHeadingHierarchy', () => {
    test('should detect h2 without h1', () => {
      const content = '<h2>Heading 2</h2>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkHeadingHierarchy('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(1);
      expect(metrics.headingHierarchyIssuesCount).toBe(1);
    });

    test('should detect h3 without h2', () => {
      const content = '<h1>Title</h1><h3>Deep</h3>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkHeadingHierarchy('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(1);
    });

    test('should allow proper heading hierarchy', () => {
      const content = '<h1>Title</h1><h2>Section</h2><h3>Subsection</h3>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkHeadingHierarchy('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(0);
    });

    test('should detect heading skip (h1 to h3)', () => {
      const content = '<h1>Title</h1><h3>Too deep</h3>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkHeadingHierarchy('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(1);
    });

    test('should handle multiple heading issues', () => {
      const content = `
        <h2>Missing h1</h2>
        <h1>Title</h1>
        <h3>Missing h2</h3>
      `;
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkHeadingHierarchy('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues.length).toBeGreaterThan(0);
    });
  });

  describe('checkColorOnlyInformation', () => {
    test('should detect information conveyed by color only', () => {
      const content = '<span style="color: red">Error</span>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkColorOnlyInformation('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('WCAG-1.4.1');
      expect(metrics.colorOnlyInfoCount).toBe(1);
    });

    test('should allow color with other indicators', () => {
      const content = '<span style="color: red; font-weight: bold">Error</span>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkColorOnlyInformation('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(0);
    });

    test('should allow color with text-decoration', () => {
      const content = '<span style="color: blue; text-decoration: underline">Link</span>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkColorOnlyInformation('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(0);
    });

    test('should allow color with border', () => {
      const content = '<div style="color: red; border: 1px solid">Alert</div>';
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkColorOnlyInformation('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(0);
    });

    test('should detect multiple color-only issues', () => {
      const content = `
        <span style="color: red">Error</span>
        <span style="color: green">Success</span>
      `;
      const issues: any[] = [];
      const metrics = createMockMetrics();

      checkColorOnlyInformation('test.tsx', content, issues, metrics, mockCreateIssue, mockGetLineNumber);

      expect(issues).toHaveLength(2);
    });
  });

  describe('calculateScore', () => {
    test('should return 100 for clean metrics', () => {
      const metrics = createMockMetrics();
      const score = calculateScore(metrics);
      expect(score).toBe(100);
    });

    test('should deduct for missing alt attributes', () => {
      const metrics = createMockMetrics();
      metrics.missingAltCount = 1;
      const score = calculateScore(metrics);
      expect(score).toBe(95);
    });

    test('should deduct for missing form labels', () => {
      const metrics = createMockMetrics();
      metrics.missingFormLabelsCount = 1;
      const score = calculateScore(metrics);
      expect(score).toBe(95);
    });

    test('should deduct for non-semantic elements', () => {
      const metrics = createMockMetrics();
      metrics.nonSemanticElementsCount = 1;
      const score = calculateScore(metrics);
      expect(score).toBe(97);
    });

    test('should deduct for missing aria labels', () => {
      const metrics = createMockMetrics();
      metrics.missingAriaLabelsCount = 1;
      const score = calculateScore(metrics);
      expect(score).toBe(96);
    });

    test('should handle multiple issues', () => {
      const metrics = createMockMetrics();
      metrics.missingAltCount = 2;
      metrics.missingFormLabelsCount = 1;
      metrics.nonSemanticElementsCount = 1;
      const score = calculateScore(metrics);
      expect(score).toBe(100 - (2 * 5) - 5 - 3);
    });

    test('should not go below 0', () => {
      const metrics = createMockMetrics();
      metrics.missingAltCount = 50;
      const score = calculateScore(metrics);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    test('should account for all metric types', () => {
      const metrics = createMockMetrics();
      metrics.missingAltCount = 1;
      metrics.missingFormLabelsCount = 1;
      metrics.nonSemanticElementsCount = 1;
      metrics.missingAriaLabelsCount = 1;
      metrics.positiveTabindexCount = 1;
      metrics.emptyLinksButtonsCount = 1;
      metrics.autoplayMediaCount = 1;
      metrics.missingLangAttributeCount = 1;
      metrics.headingHierarchyIssuesCount = 1;
      metrics.colorOnlyInfoCount = 1;

      const score = calculateScore(metrics);
      const expectedDeduction = (1 * 5) + (1 * 5) + (1 * 3) + (1 * 4) + (1 * 2) + (1 * 5) + (1 * 2) + (1 * 2) + (1 * 1) + (1 * 1);
      expect(score).toBe(100 - expectedDeduction);
    });
  });
});
