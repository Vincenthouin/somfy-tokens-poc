import React, { useEffect, useState } from 'react';
import { Project } from '../shared/types';
import { ProjectPicker } from './components/ProjectPicker';
import { ProjectWizard } from './components/ProjectWizard';
import { EditorScreen } from './EditorScreen';

type View = 'picker' | 'wizard' | 'editor';

export const App: React.FC = () => {
  const [view, setView] = useState<View>('picker');
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [bootDone, setBootDone] = useState(false);

  // Bootstrap : if a current project is set, open the editor on it
  useEffect(() => {
    (async () => {
      try {
        const project = await window.api.getCurrentProject();
        if (project) {
          setCurrentProject(project);
          setView('editor');
        }
      } finally {
        setBootDone(true);
      }
    })();
  }, []);

  const openProject = async (id: string) => {
    await window.api.setCurrentProject(id);
    const list = await window.api.listProjects();
    const summary = list.find((p) => p.id === id);
    if (!summary) return;
    // Fetch the full project (loadTokens will be called inside the editor)
    const full = await window.api.getCurrentProject();
    if (full) {
      setCurrentProject(full);
      setView('editor');
    }
  };

  const backToPicker = async () => {
    await window.api.setCurrentProject(null);
    setCurrentProject(null);
    setView('picker');
  };

  const handleProjectCreated = (p: Project) => {
    setCurrentProject(p);
    setView('editor');
  };

  if (!bootDone) {
    return <div className="loading-screen">Démarrage…</div>;
  }

  if (view === 'editor' && currentProject) {
    return (
      <EditorScreen
        project={currentProject}
        onProjectChange={(p) => setCurrentProject(p)}
        onBackToProjects={backToPicker}
      />
    );
  }

  return (
    <>
      <ProjectPicker onOpen={openProject} onCreate={() => setView('wizard')} />
      {view === 'wizard' && (
        <ProjectWizard onCancel={() => setView('picker')} onCreated={handleProjectCreated} />
      )}
    </>
  );
};
