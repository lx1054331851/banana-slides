import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';

export const DetailEditor: React.FC = () => {
  const location = useLocation();
  const { projectId } = useParams<{ projectId: string }>();

  if (!projectId) {
    return <Navigate to="/" replace />;
  }

  const search = location.search || '';

  return (
    <Navigate
      to={`/project/${projectId}/preview${search}`}
      replace
      state={location.state}
    />
  );
};
