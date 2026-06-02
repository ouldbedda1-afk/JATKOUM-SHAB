import React from 'react';
import ReactECharts from 'echarts-for-react';
import { useWeather } from '../useWeather';

const WeatherCharts = ({ city }) => {
  const cityName = typeof city === 'string' ? city : city.name;
  const { data: weatherData, loading } = useWeather(cityName, typeof city === 'object' ? city : null);

  if (loading || !weatherData) return (
    <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100 h-64 animate-pulse"></div>
  );

  // Extract next 24 hours
  const hours = weatherData.hourly.time.slice(0, 24).map(t => {
    const date = new Date(t);
    return `${date.getHours()}:00`;
  });
  const temps = weatherData.hourly.temperature_2m.slice(0, 24);
  const rainProbs = weatherData.hourly.precipitation_probability.slice(0, 24);

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderWidth: 0,
      textStyle: { color: '#1e293b' }
    },
    legend: {
      data: ['الحرارة (°م)', 'احتمال المطر (%)'],
      bottom: 0,
      textStyle: { color: '#64748b', fontWeight: 'bold' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      top: '10%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: hours,
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisLabel: { color: '#94a3b8' }
    },
    yAxis: [
      {
        type: 'value',
        name: 'حرارة',
        position: 'right',
        splitLine: { lineStyle: { type: 'dashed', color: '#f1f5f9' } },
        axisLabel: { color: '#ef4444' }
      },
      {
        type: 'value',
        name: 'مطر',
        position: 'left',
        max: 100,
        splitLine: { show: false },
        axisLabel: { color: '#3b82f6' }
      }
    ],
    series: [
      {
        name: 'الحرارة (°م)',
        type: 'line',
        smooth: true,
        data: temps,
        yAxisIndex: 0,
        itemStyle: { color: '#ef4444' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: 'rgba(239, 68, 68, 0.2)' }, { offset: 1, color: 'rgba(239, 68, 68, 0)' }]
          }
        }
      },
      {
        name: 'احتمال المطر (%)',
        type: 'bar',
        data: rainProbs,
        yAxisIndex: 1,
        itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] }
      }
    ]
  };

  return (
    <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100">
      <h3 className="text-xl font-bold text-gray-800 mb-6">توقعات الـ 24 ساعة القادمة</h3>
      <div className="h-[300px]">
        <ReactECharts option={option} style={{ height: '100%' }} />
      </div>
    </div>
  );
};

export default WeatherCharts;
