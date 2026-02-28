/**
 * Metrics Collection System
 * 
 * Provides in-memory metrics collection with Prometheus-compatible export.
 * Tracks counters, gauges, and histograms for system observability.
 */

export type MetricType = 'counter' | 'gauge' | 'histogram';

export interface MetricLabels {
  [key: string]: string | number;
}

export interface Metric {
  name: string;
  type: MetricType;
  help: string;
  value: number;
  labels: MetricLabels;
  timestamp: number;
}

export interface HistogramBucket {
  le: number;
  count: number;
}

export interface HistogramMetric extends Metric {
  type: 'histogram';
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

/**
 * Metrics Registry
 * 
 * Central store for all application metrics.
 */
class MetricsRegistry {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, { buckets: number[]; values: number[] }> = new Map();
  private metricInfo: Map<string, { type: MetricType; help: string; buckets?: number[] }> = new Map();

  /**
   * Register a counter metric
   */
  registerCounter(name: string, help: string, labels: MetricLabels = {}): void {
    if (!this.metricInfo.has(name)) {
      this.metricInfo.set(name, { type: 'counter', help });
    }
    // Initialize this specific label combination
    const key = this.makeKey(name, labels);
    if (!this.counters.has(key)) {
      this.counters.set(key, 0);
    }
  }

  /**
   * Increment a counter
   */
  incCounter(name: string, labels: MetricLabels = {}, value: number = 1): void {
    // Auto-register if needed
    if (!this.metricInfo.has(name)) {
      this.registerCounter(name, `Auto-generated counter: ${name}`, labels);
    }
    
    const key = this.makeKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
  }

  /**
   * Register a gauge metric
   */
  registerGauge(name: string, help: string, labels: MetricLabels = {}): void {
    if (!this.metricInfo.has(name)) {
      this.metricInfo.set(name, { type: 'gauge', help });
    }
    // Initialize this specific label combination
    const key = this.makeKey(name, labels);
    if (!this.gauges.has(key)) {
      this.gauges.set(key, 0);
    }
  }

  /**
   * Set a gauge value
   */
  setGauge(name: string, labels: MetricLabels = {}, value: number): void {
    // Auto-register if needed
    if (!this.metricInfo.has(name)) {
      this.registerGauge(name, `Auto-generated gauge: ${name}`, labels);
    }
    
    const key = this.makeKey(name, labels);
    this.gauges.set(key, value);
  }

  /**
   * Increment a gauge
   */
  incGauge(name: string, labels: MetricLabels = {}, value: number = 1): void {
    const key = this.makeKey(name, labels);
    const current = this.gauges.get(key) || 0;
    this.setGauge(name, labels, current + value);
  }

  /**
   * Decrement a gauge
   */
  decGauge(name: string, labels: MetricLabels = {}, value: number = 1): void {
    const key = this.makeKey(name, labels);
    const current = this.gauges.get(key) || 0;
    this.setGauge(name, labels, current - value);
  }

  /**
   * Register a histogram metric
   */
  registerHistogram(name: string, help: string, buckets: number[], labels: MetricLabels = {}): void {
    if (!this.metricInfo.has(name)) {
      this.metricInfo.set(name, { type: 'histogram', help, buckets });
    }
    // Initialize this specific label combination
    const key = this.makeKey(name, labels);
    if (!this.histograms.has(key)) {
      const info = this.metricInfo.get(name)!;
      this.histograms.set(key, { buckets: info.buckets || buckets, values: [] });
    }
  }

  /**
   * Observe a value in a histogram
   */
  observeHistogram(name: string, labels: MetricLabels = {}, value: number): void {
    // Auto-register if needed with default buckets
    if (!this.metricInfo.has(name)) {
      this.registerHistogram(name, `Auto-generated histogram: ${name}`, [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10], labels);
    }
    
    const key = this.makeKey(name, labels);
    let histogram = this.histograms.get(key);
    if (!histogram) {
      const info = this.metricInfo.get(name)!;
      histogram = { buckets: info.buckets || [], values: [] };
      this.histograms.set(key, histogram);
    }
    histogram.values.push(value);
  }

  /**
   * Get all metrics in Prometheus text format
   */
  export(): string {
    const lines: string[] = [];
    const processedMetrics = new Set<string>();

    // Export counters
    for (const [key, value] of this.counters.entries()) {
      const baseName = key.split('{')[0];
      const info = this.metricInfo.get(baseName);
      if (info && !processedMetrics.has(baseName)) {
        lines.push(`# HELP ${baseName} ${info.help}`);
        lines.push(`# TYPE ${baseName} counter`);
        processedMetrics.add(baseName);
      }
      if (info) {
        lines.push(`${key} ${value}`);
      }
    }

    // Export gauges
    for (const [key, value] of this.gauges.entries()) {
      const baseName = key.split('{')[0];
      const info = this.metricInfo.get(baseName);
      if (info && !processedMetrics.has(baseName)) {
        lines.push(`# HELP ${baseName} ${info.help}`);
        lines.push(`# TYPE ${baseName} gauge`);
        processedMetrics.add(baseName);
      }
      if (info) {
        lines.push(`${key} ${value}`);
      }
    }

    // Export histograms
    const histogramsByName = new Map<string, Array<[string, { buckets: number[]; values: number[] }]>>();
    for (const [key, histogram] of this.histograms.entries()) {
      const baseName = key.split('{')[0];
      if (!histogramsByName.has(baseName)) {
        histogramsByName.set(baseName, []);
      }
      histogramsByName.get(baseName)!.push([key, histogram]);
    }

    for (const [baseName, entries] of histogramsByName.entries()) {
      const info = this.metricInfo.get(baseName);
      if (info && !processedMetrics.has(baseName)) {
        lines.push(`# HELP ${baseName} ${info.help}`);
        lines.push(`# TYPE ${baseName} histogram`);
        processedMetrics.add(baseName);
      }

      for (const [key, histogram] of entries) {
        const labelsMatch = key.match(/\{(.+)\}/);
        const baseLabels = labelsMatch ? labelsMatch[1] : '';

        const values = histogram.values;
        const sum = values.reduce((a, b) => a + b, 0);
        const count = values.length;

        // Bucket counts
        for (const le of histogram.buckets) {
          const bucketCount = values.filter(v => v <= le).length;
          const labels = baseLabels ? `${baseLabels},le="${le}"` : `le="${le}"`;
          lines.push(`${baseName}_bucket{${labels}} ${bucketCount}`);
        }
        const infLabels = baseLabels ? `${baseLabels},le="+Inf"` : `le="+Inf"`;
        lines.push(`${baseName}_bucket{${infLabels}} ${count}`);
        
        const sumLabels = baseLabels ? `{${baseLabels}}` : '';
        lines.push(`${baseName}_sum${sumLabels} ${sum}`);
        lines.push(`${baseName}_count${sumLabels} ${count}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Get metrics as JSON
   */
  exportJSON(): Metric[] {
    const metrics: Metric[] = [];
    const now = Date.now();

    for (const [key, value] of this.counters.entries()) {
      const baseName = key.split('{')[0];
      const info = this.metricInfo.get(baseName);
      if (info) {
        const labelsMatch = key.match(/\{(.+)\}/);
        const labels: MetricLabels = {};
        if (labelsMatch) {
          const labelPairs = labelsMatch[1].split(',');
          for (const pair of labelPairs) {
            const [k, v] = pair.split('=');
            labels[k] = v.replace(/"/g, '');
          }
        }

        metrics.push({
          name: baseName,
          type: 'counter',
          help: info.help,
          value,
          labels,
          timestamp: now
        });
      }
    }

    for (const [key, value] of this.gauges.entries()) {
      const baseName = key.split('{')[0];
      const info = this.metricInfo.get(baseName);
      if (info) {
        const labelsMatch = key.match(/\{(.+)\}/);
        const labels: MetricLabels = {};
        if (labelsMatch) {
          const labelPairs = labelsMatch[1].split(',');
          for (const pair of labelPairs) {
            const [k, v] = pair.split('=');
            labels[k] = v.replace(/"/g, '');
          }
        }

        metrics.push({
          name: baseName,
          type: 'gauge',
          help: info.help,
          value,
          labels,
          timestamp: now
        });
      }
    }

    for (const [key, histogram] of this.histograms.entries()) {
      const baseName = key.split('{')[0];
      const info = this.metricInfo.get(baseName);
      if (info) {
        const values = histogram.values;
        const sum = values.reduce((a, b) => a + b, 0);
        const count = values.length;

        const labelsMatch = key.match(/\{(.+)\}/);
        const labels: MetricLabels = {};
        if (labelsMatch) {
          const labelPairs = labelsMatch[1].split(',');
          for (const pair of labelPairs) {
            const [k, v] = pair.split('=');
            labels[k] = v.replace(/"/g, '');
          }
        }

        const buckets: HistogramBucket[] = histogram.buckets.map(le => ({
          le,
          count: values.filter(v => v <= le).length
        }));

        metrics.push({
          name: baseName,
          type: 'histogram',
          help: info.help,
          value: sum / count || 0,
          labels,
          timestamp: now,
          buckets,
          sum,
          count
        } as HistogramMetric);
      }
    }

    return metrics;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.metricInfo.clear();
  }

  /**
   * Make a unique key from metric name and labels
   */
  private makeKey(name: string, labels: MetricLabels): string {
    if (Object.keys(labels).length === 0) {
      return name;
    }
    return `${name}{${this.formatLabels(labels)}}`;
  }

  /**
   * Format labels for Prometheus export
   */
  private formatLabels(labels: MetricLabels): string {
    return Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }
}

// Global registry instance
export const metricsRegistry = new MetricsRegistry();

// Standard application metrics
metricsRegistry.registerCounter('http_requests_total', 'Total HTTP requests', { method: '', path: '', status: '' });
metricsRegistry.registerHistogram('http_request_duration_seconds', 'HTTP request duration', [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10], { method: '', path: '' });
metricsRegistry.registerCounter('http_errors_total', 'Total HTTP errors', { method: '', path: '', status: '' });

metricsRegistry.registerGauge('planning_projects_active', 'Number of active projects');
metricsRegistry.registerGauge('planning_thoughts_total', 'Total thoughts across all projects');
metricsRegistry.registerGauge('planning_clusters_total', 'Total clusters across all projects');

metricsRegistry.registerCounter('store_operations_total', 'Total store operations', { store: '', operation: '' });
metricsRegistry.registerHistogram('store_operation_duration_seconds', 'Store operation duration', [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1], { store: '', operation: '' });
metricsRegistry.registerCounter('store_errors_total', 'Total store errors', { store: '', operation: '' });

metricsRegistry.registerCounter('circuit_breaker_state_transitions', 'Circuit breaker state transitions', { breaker: '', from: '', to: '' });
metricsRegistry.registerGauge('circuit_breaker_state', 'Current circuit breaker state (0=CLOSED, 1=OPEN, 2=HALF_OPEN)', { breaker: '' });
metricsRegistry.registerCounter('circuit_breaker_requests_total', 'Total circuit breaker requests', { breaker: '', result: '' });

metricsRegistry.registerCounter('retry_attempts_total', 'Total retry attempts', { operation: '', result: '' });
metricsRegistry.registerHistogram('retry_delay_seconds', 'Retry delay duration', [0.1, 0.5, 1, 2, 5, 10, 30], { operation: '' });
