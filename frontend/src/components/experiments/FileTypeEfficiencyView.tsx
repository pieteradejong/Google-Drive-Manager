/** File Type Efficiency - Compare compressed vs uncompressed formats */
import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingDown, FileText, Image } from 'lucide-react';
import { formatSize } from '../../utils/navigation';
import type { FileItem } from '../../types/drive';

interface FileTypeEfficiencyViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

// File type comparisons
const TYPE_COMPARISONS = {
  documents: {
    pdf: { pattern: /^application\/pdf$/i, label: 'PDF' },
    docx: { pattern: /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml/i, label: 'DOCX' },
    doc: { pattern: /^application\/msword$/i, label: 'DOC' },
    gdoc: { pattern: /^application\/vnd\.google-apps\.document$/i, label: 'Google Doc' },
  },
  images: {
    jpg: { pattern: /^image\/jpeg$/i, label: 'JPEG' },
    png: { pattern: /^image\/png$/i, label: 'PNG' },
    gif: { pattern: /^image\/gif$/i, label: 'GIF' },
    webp: { pattern: /^image\/webp$/i, label: 'WebP' },
    heic: { pattern: /^image\/heic$/i, label: 'HEIC' },
  },
  spreadsheets: {
    xlsx: { pattern: /^application\/vnd\.openxmlformats-officedocument\.spreadsheetml/i, label: 'XLSX' },
    xls: { pattern: /^application\/vnd\.ms-excel$/i, label: 'XLS' },
    gsheet: { pattern: /^application\/vnd\.google-apps\.spreadsheet$/i, label: 'Google Sheet' },
  },
};

export const FileTypeEfficiencyView = ({ files, childrenMap, onFileClick }: FileTypeEfficiencyViewProps) => {
  // Analyze document types
  const documentStats = useMemo(() => {
    const stats = new Map<string, { count: number; totalSize: number; avgSize: number }>();
    
    Object.entries(TYPE_COMPARISONS.documents).forEach(([key, { pattern, label }]) => {
      const matching = files.filter(f => pattern.test(f.mimeType));
      const totalSize = matching.reduce((sum, f) => sum + (f.size || 0), 0);
      stats.set(label, {
        count: matching.length,
        totalSize,
        avgSize: matching.length > 0 ? totalSize / matching.length : 0
      });
    });
    
    return Array.from(stats.entries()).map(([type, data]) => ({ type, ...data }));
  }, [files]);

  // Analyze image types
  const imageStats = useMemo(() => {
    const stats = new Map<string, { count: number; totalSize: number; avgSize: number }>();
    
    Object.entries(TYPE_COMPARISONS.images).forEach(([key, { pattern, label }]) => {
      const matching = files.filter(f => pattern.test(f.mimeType));
      const totalSize = matching.reduce((sum, f) => sum + (f.size || 0), 0);
      stats.set(label, {
        count: matching.length,
        totalSize,
        avgSize: matching.length > 0 ? totalSize / matching.length : 0
      });
    });
    
    return Array.from(stats.entries()).map(([type, data]) => ({ type, ...data }));
  }, [files]);

  return (
    <div className="flex flex-col h-full overflow-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">File Type Efficiency</h2>
        <p className="text-gray-600">
          Compare file sizes across different formats to identify optimization opportunities
        </p>
      </div>

      {/* Document Comparison */}
      {documentStats.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileText className="text-blue-500" size={20} />
            Document Formats
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Average File Size</h4>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={documentStats}>
                  <XAxis dataKey="type" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatSize(value)} />
                  <Bar dataKey="avgSize" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Total Storage</h4>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={documentStats}>
                  <XAxis dataKey="type" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatSize(value)} />
                  <Bar dataKey="totalSize" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2">Format</th>
                  <th className="text-right py-2">Count</th>
                  <th className="text-right py-2">Total Size</th>
                  <th className="text-right py-2">Avg Size</th>
                </tr>
              </thead>
              <tbody>
                {documentStats.map((stat) => (
                  <tr key={stat.type} className="border-b border-gray-100">
                    <td className="py-2">{stat.type}</td>
                    <td className="text-right py-2">{stat.count}</td>
                    <td className="text-right py-2">{formatSize(stat.totalSize)}</td>
                    <td className="text-right py-2">{formatSize(stat.avgSize)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Image Comparison */}
      {imageStats.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Image className="text-green-500" size={20} />
            Image Formats
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Average File Size</h4>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={imageStats}>
                  <XAxis dataKey="type" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatSize(value)} />
                  <Bar dataKey="avgSize" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Total Storage</h4>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={imageStats}>
                  <XAxis dataKey="type" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatSize(value)} />
                  <Bar dataKey="totalSize" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2">Format</th>
                  <th className="text-right py-2">Count</th>
                  <th className="text-right py-2">Total Size</th>
                  <th className="text-right py-2">Avg Size</th>
                </tr>
              </thead>
              <tbody>
                {imageStats.map((stat) => (
                  <tr key={stat.type} className="border-b border-gray-100">
                    <td className="py-2">{stat.type}</td>
                    <td className="text-right py-2">{stat.count}</td>
                    <td className="text-right py-2">{formatSize(stat.totalSize)}</td>
                    <td className="text-right py-2">{formatSize(stat.avgSize)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {documentStats.length === 0 && imageStats.length === 0 && (
        <div className="text-center text-gray-500 mt-8">
          <TrendingDown size={48} className="mx-auto mb-4 text-gray-400" />
          <p className="text-lg font-medium">No comparable file types found</p>
        </div>
      )}
    </div>
  );
};
