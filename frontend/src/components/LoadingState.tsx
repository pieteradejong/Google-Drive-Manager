/** Loading state component showing what operation is being performed */
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  operation: string;
  details?: string;
  progress?: number; // 0-100
  className?: string;
}

export const LoadingState = ({ 
  operation, 
  details, 
  progress,
  className = '' 
}: LoadingStateProps) => {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 ${className}`}>
      <Loader2 className="animate-spin text-primary-600 mb-4" size={32} />
      <div className="text-center">
        <div className="text-lg font-semibold text-gray-900 mb-2">
          {operation}
        </div>
        {details && (
          <div className="text-sm text-gray-600 mb-4">
            {details}
          </div>
        )}
        {progress !== undefined && (
          <div className="w-64 bg-gray-200 rounded-full h-2 mb-2">
            <div
              className="bg-primary-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        <div className="text-xs text-gray-500 mt-2">
          This may take a moment for large drives...
        </div>
      </div>
    </div>
  );
};
