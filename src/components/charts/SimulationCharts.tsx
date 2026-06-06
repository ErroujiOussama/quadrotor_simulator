/**
 * Real-time Charts for Simulation Data
 */

import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { SimulationData } from '@/lib/simulation/DroneSimulator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface SimulationChartsProps {
  data: SimulationData[];
  timeWindow?: number; // seconds
}

export const SimulationCharts: React.FC<SimulationChartsProps> = ({
  data,
  timeWindow = 20
}) => {
  const chartData = useMemo(() => {
    // Filter data to time window
    const currentTime = data.length > 0 ? data[data.length - 1].time : 0;
    const filteredData = data.filter(d => d.time >= currentTime - timeWindow);
    
    const times = filteredData.map(d => d.time.toFixed(1));
    
    return {
      labels: times,
      position: {
        labels: times,
        datasets: [
          {
            label: 'X Position (m)',
            data: filteredData.map(d => d.state.position.x),
            borderColor: 'hsl(var(--chart-1))',
            backgroundColor: 'hsl(var(--chart-1) / 0.1)',
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2
          },
          {
            label: 'Y Position (m)',
            data: filteredData.map(d => d.state.position.y),
            borderColor: 'hsl(var(--chart-2))',
            backgroundColor: 'hsl(var(--chart-2) / 0.1)',
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2
          },
          {
            label: 'Z Position (m)',
            data: filteredData.map(d => d.state.position.z),
            borderColor: 'hsl(var(--chart-3))',
            backgroundColor: 'hsl(var(--chart-3) / 0.1)',
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2
          }
        ]
      },
      attitude: {
        labels: times,
        datasets: [
          {
            label: 'Roll (rad)',
            data: filteredData.map(d => d.state.orientation.roll),
            borderColor: 'hsl(var(--chart-1))',
            backgroundColor: 'hsl(var(--chart-1) / 0.1)',
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2
          },
          {
            label: 'Pitch (rad)',
            data: filteredData.map(d => d.state.orientation.pitch),
            borderColor: 'hsl(var(--chart-2))',
            backgroundColor: 'hsl(var(--chart-2) / 0.1)',
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2
          },
          {
            label: 'Yaw (rad)',
            data: filteredData.map(d => d.state.orientation.yaw),
            borderColor: 'hsl(var(--chart-3))',
            backgroundColor: 'hsl(var(--chart-3) / 0.1)',
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2
          }
        ]
      },
      motors: {
        labels: times,
        // One dataset per rotor — works for quad / hexa / octo alike.
        datasets: Array.from(
          { length: filteredData[filteredData.length - 1]?.motorThrottles.length ?? 0 },
          (_, i) => ({
            label: `Motor ${i + 1}`,
            data: filteredData.map(d => (d.motorThrottles[i] ?? 0) * 100),
            borderColor: `hsl(var(--chart-${(i % 5) + 1}))`,
            backgroundColor: `hsl(var(--chart-${(i % 5) + 1}) / 0.1)`,
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 1
          })
        )
      },
      errors: {
        labels: times,
        datasets: [
          {
            label: 'Altitude Error (m)',
            data: filteredData.map(d => d.errors.altitude),
            borderColor: 'hsl(var(--chart-1))',
            backgroundColor: 'hsl(var(--chart-1) / 0.1)',
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2
          },
          {
            label: 'Roll Error (rad)',
            data: filteredData.map(d => d.errors.roll),
            borderColor: 'hsl(var(--chart-2))',
            backgroundColor: 'hsl(var(--chart-2) / 0.1)',
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2
          },
          {
            label: 'Pitch Error (rad)',
            data: filteredData.map(d => d.errors.pitch),
            backgroundColor: 'hsl(var(--chart-3) / 0.1)',
            borderColor: 'hsl(var(--chart-3))',
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2
          }
        ]
      },
      control: {
        labels: times,
        datasets: [
          {
            label: 'Altitude Control',
            data: filteredData.map(d => d.controlOutputs.altitude),
            borderColor: 'hsl(var(--chart-1))',
            backgroundColor: 'hsl(var(--chart-1) / 0.1)',
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2
          },
          {
            label: 'Roll Control',
            data: filteredData.map(d => d.controlOutputs.roll),
            borderColor: 'hsl(var(--chart-2))',
            backgroundColor: 'hsl(var(--chart-2) / 0.1)',
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2
          },
          {
            label: 'Pitch Control',
            data: filteredData.map(d => d.controlOutputs.pitch),
            borderColor: 'hsl(var(--chart-3))',
            backgroundColor: 'hsl(var(--chart-3) / 0.1)',
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2
          }
        ]
      }
    };
  }, [data, timeWindow]);

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: {
      intersect: false
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          font: {
            size: 11
          },
          usePointStyle: true,
          pointStyle: 'line'
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Time (s)'
        },
        grid: {
          color: 'hsl(var(--border))'
        }
      },
      y: {
        display: true,
        grid: {
          color: 'hsl(var(--border))'
        }
      }
    },
    elements: {
      line: {
        tension: 0.4
      }
    }
  };

  if (data.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {['Position', 'Attitude', 'Motor Outputs', 'Control Errors', 'Control Signals'].map((title) => (
          <Card key={title} className="h-64">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{title}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 h-48 flex items-center justify-center">
              <p className="text-muted-foreground text-sm">No data available</p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card className="h-64">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Position</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 h-48">
          <Line data={chartData.position} options={chartOptions} />
        </CardContent>
      </Card>

      <Card className="h-64">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Attitude</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 h-48">
          <Line data={chartData.attitude} options={chartOptions} />
        </CardContent>
      </Card>

      <Card className="h-64">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Motor Outputs (%)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 h-48">
          <Line data={chartData.motors} options={chartOptions} />
        </CardContent>
      </Card>

      <Card className="h-64">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Control Errors</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 h-48">
          <Line data={chartData.errors} options={chartOptions} />
        </CardContent>
      </Card>

      <Card className="h-64">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Control Signals</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 h-48">
          <Line data={chartData.control} options={chartOptions} />
        </CardContent>
      </Card>
    </div>
  );
};