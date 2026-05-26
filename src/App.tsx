import { useState, useEffect } from 'react';
import type { Project, SponsorLogo, ApparelType } from './types';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { AuthModal } from './components/AuthModal';
import { LandingPage } from './components/LandingPage';
import { ProductionStudio } from './components/ProductionStudio';
import { PreFlightPanel } from './components/PreFlightPanel';
import { AIDesignStudio } from './components/AIDesignStudio';
import { 
  Layers, FileText, Download,
  ChevronLeft, ArrowRight, Sparkles, Menu, Upload,
  AlertTriangle, Trash2, Plus, Search, Folder, Archive, FolderPlus, X
} from 'lucide-react';

// Default Project Settings
const initialProject: Project = {
  name: 'Esports Championship Jersey',
  stage: 'brief',
  apparelType: 'esports_jersey',
  baseColors: {
    primary: '#09090b',
    secondary: '#111115',
    accent: '#0070f3',
    highlight: '#ffffff',
    baseColor: '#09090b',
  },
  logos: [],
  prompt: '',
  selectedPresetId: '',
  rules: {
    frontLogoSpacingCollarInches: 3.5,
    chestAlignment: 'center',
    sponsorSpacingInches: 1.5,
    playerNameHeightInches: 2.0,
    playerNumberHeightInches: 8.0,
    surnameSpacingCollarInches: 4.5,
    maxTextWidthInches: 12.0,
    autoFitSizing: true,
    safeMarginInches: 0.5,
    bleedInches: 0.25,
    seamAllowanceInches: 0.5,
    autoCenter: true,
    smartSnapping: true,
    collisionPrevention: true,
    dynamicScaling: true,
  },
  roster: [
    { id: 'roster-1', name: 'JAY', number: '7', size: 'M', nameScale: 1.0, variant: 'Variant A', status: 'Mapped' },
    { id: 'roster-2', name: 'MARK', number: '10', size: 'L', nameScale: 1.0, variant: 'Variant B', status: 'Ready for Export' },
    { id: 'roster-3', name: 'LEX', number: '23', size: 'S', nameScale: 1.0, variant: 'Variant A', status: 'Mapped' }
  ],
  measurementUnit: 'inches',
  activePlayerId: 'roster-1',
  activeCanvasView: 'front',
  hiddenLayers: [],
  lockedLayers: [],
  selectedLayerId: 'template-front',
};

// Default projects pre-population
const defaultProjects: Project[] = [
  {
    ...initialProject,
    id: 'project-esports-jersey',
    name: 'Esports Championship Jersey',
    templateChoice: 'Pro Athletic Fit',
    canvasSize: '2400 x 2400 px',
    dpi: 300,
    colorMode: 'CMYK',
    createdAt: new Date('2026-05-20T10:00:00Z').toISOString(),
    isArchived: false,
  },
  {
    ...initialProject,
    id: 'project-retro-sweatshirt',
    name: 'Retro Vaporwave Sweatshirt',
    apparelType: 'crewneck_sweatshirt',
    templateChoice: 'Loose Street Fit',
    canvasSize: '3000 x 3000 px',
    dpi: 300,
    colorMode: 'CMYK',
    createdAt: new Date('2026-05-24T14:30:00Z').toISOString(),
    isArchived: false,
    prompt: 'vaporwave grid pattern with bright neon colors',
    selectedPresetId: 'retro-grid',
    baseColors: {
      primary: '#09090c',
      secondary: '#140c1d',
      accent: '#ff0055',
      highlight: '#ffffff',
      baseColor: '#09090c',
    }
  }
];

const createNewProject = (details: {
  name: string;
  apparelType: ApparelType;
  templateChoice: string;
  canvasSize: string;
  dpi: number;
  colorMode: 'RGB' | 'CMYK';
}) => {
  return {
    ...initialProject,
    id: `project-${Date.now()}`,
    name: details.name,
    apparelType: details.apparelType,
    templateChoice: details.templateChoice,
    canvasSize: details.canvasSize,
    dpi: details.dpi,
    colorMode: details.colorMode,
    createdAt: new Date().toISOString(),
    isArchived: false,
    baseColors: details.apparelType === 'crewneck_sweatshirt' ? {
      primary: '#111115',
      secondary: '#24242e',
      accent: '#00e676',
      highlight: '#ffffff',
      baseColor: '#111115',
    } : {
      primary: '#09090b',
      secondary: '#111115',
      accent: '#0070f3',
      highlight: '#ffffff',
      baseColor: '#09090b',
    }
  };
};

export default function App() {
  const [view, setView] = useState<'landing' | 'dashboard' | 'editor'>('landing');
  
  // Auth state
  const [session, setSession] = useState<Session | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Projects List state
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project>(defaultProjects[0]);
  const [isLoading, setIsLoading] = useState(true);

  // Listen to Auth state changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fetch projects from Supabase when session changes
  useEffect(() => {
    const fetchProjects = async () => {
      if (!session) {
        setProjects(defaultProjects);
        setProject(defaultProjects[0]);
        return;
      }

      setIsLoading(true);
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching projects:', error);
      } else if (data && data.length > 0) {
        const mappedProjects: Project[] = data.map(row => ({
          id: row.id,
          name: row.name,
          apparelType: row.apparel_type as ApparelType,
          stage: row.stage as any,
          templateChoice: row.template_choice,
          canvasSize: row.canvas_size,
          dpi: row.dpi,
          colorMode: row.color_mode as any,
          isArchived: row.is_archived,
          createdAt: row.created_at,
          ...row.project_data
        }));
        setProjects(mappedProjects);
        const activeProj = mappedProjects.find(p => !p.isArchived) || mappedProjects[0];
        setProject(activeProj);
      } else {
        // Fallback to default if no projects exist in Supabase
        setProjects(defaultProjects);
        setProject(defaultProjects[0]);
      }
      setIsLoading(false);
    };
    fetchProjects();
  }, [session]);

  // Dashboard Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'active' | 'archived' | 'drafts'>('active');

  // Project Creation Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newGarmentType, setNewGarmentType] = useState<ApparelType>('esports_jersey');
  const [newTemplateChoice, setNewTemplateChoice] = useState('Pro Athletic Fit');
  const [newCanvasSize, setNewCanvasSize] = useState('2400 x 2400 px');
  const [newDpi, setNewDpi] = useState<number>(300);
  const [newColorMode, setNewColorMode] = useState<'RGB' | 'CMYK'>('CMYK');

  const [isSidebarExpanded, setIsSidebarExpanded] = useState<boolean>(true);
  const [aiGenerating, setAiGenerating] = useState<boolean>(false);
  const [aiHistory, setAiHistory] = useState<string[]>([]);
  const [logMessages, setLogMessages] = useState<string[]>(['Workspace initialized.', 'Seam rules loaded: Standard 0.5" Margins.']);
  const [zoom, setZoom] = useState<number>(0.85);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Sync current project edits back to projects list and Supabase
  useEffect(() => {
    if (project && project.id && !isLoading) {
      // Optimistic local update
      setProjects(prev => prev.map(p => p.id === project.id ? project : p));
      
      // Debounced Supabase sync
      const timer = setTimeout(async () => {
        // Ignore default projects that haven't been saved yet
        if (project.id?.startsWith('project-')) return; 

        const { id, name, apparelType, stage, templateChoice, canvasSize, dpi, colorMode, isArchived, createdAt, ...projectData } = project;
        const { error } = await supabase.from('projects').update({
          name, 
          apparel_type: apparelType, 
          stage, 
          template_choice: templateChoice, 
          canvas_size: canvasSize, 
          dpi, 
          color_mode: colorMode, 
          is_archived: isArchived, 
          project_data: projectData
        }).eq('id', id);

        if (error) console.error('Error auto-saving project:', error);
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [project, isLoading]);

  // Handlers for dashboard actions
  const handleOpenProject = (p: Project) => {
    setProject(p);
    setView('editor');
    addLog(`Opened project: ${p.name}`);
  };

  const handleToggleArchive = async (id: string | undefined) => {
    if (!id) return;
    
    // Find the project to toggle
    const projToToggle = projects.find(p => p.id === id);
    if (!projToToggle) return;
    const newArchivedState = !projToToggle.isArchived;

    // Optimistic UI update
    setProjects(prev => prev.map(p => {
      if (p.id === id) {
        const next = { ...p, isArchived: newArchivedState };
        if (project.id === id) {
          setProject(next);
        }
        addLog(next.isArchived ? `Archived project: ${p.name}` : `Restored project: ${p.name}`);
        return next;
      }
      return p;
    }));

    // Supabase update
    if (!id.startsWith('project-')) {
      await supabase.from('projects').update({ is_archived: newArchivedState }).eq('id', id);
    }
  };

  const handleDeleteProject = async (id: string | undefined) => {
    if (!id) return;
    if (confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      // Optimistic UI update
      setProjects(prev => {
        const next = prev.filter(p => p.id !== id);
        // If deleting current project, pick another one
        if (project.id === id && next.length > 0) {
          setProject(next[0]);
        }
        addLog('Deleted project.');
        return next;
      });

      // Supabase delete
      if (!id.startsWith('project-')) {
        await supabase.from('projects').delete().eq('id', id);
      }
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;

    const newProj = createNewProject({
      name: newProjectName,
      apparelType: newGarmentType,
      templateChoice: newTemplateChoice,
      canvasSize: newCanvasSize,
      dpi: newDpi,
      colorMode: newColorMode,
    });

    const { id, name, apparelType, stage, templateChoice, canvasSize, dpi, colorMode, isArchived, createdAt, ...projectData } = newProj;

    // Insert into Supabase
    const { data, error } = await supabase.from('projects').insert([{
      name, 
      apparel_type: apparelType, 
      stage, 
      template_choice: templateChoice, 
      canvas_size: canvasSize, 
      dpi, 
      color_mode: colorMode, 
      is_archived: isArchived, 
      project_data: projectData
    }]).select().single();

    if (error) {
      console.error('Error creating project in Supabase:', error);
      alert('Failed to create project.');
      return;
    }

    // Map database response to Project interface
    const savedProj: Project = {
      id: data.id,
      name: data.name,
      apparelType: data.apparel_type as ApparelType,
      stage: data.stage as any,
      templateChoice: data.template_choice,
      canvasSize: data.canvas_size,
      dpi: data.dpi,
      colorMode: data.color_mode as any,
      isArchived: data.is_archived,
      createdAt: data.created_at,
      ...data.project_data
    };

    setProjects(prev => [savedProj, ...prev]);
    setProject(savedProj);
    setIsModalOpen(false);

    // Reset Form
    setNewProjectName('');
    setNewGarmentType('esports_jersey');
    setNewTemplateChoice('Pro Athletic Fit');
    setNewCanvasSize('2400 x 2400 px');
    setNewDpi(300);
    setNewColorMode('CMYK');

    setView('editor');
    addLog(`Created new project: ${savedProj.name}`);
  };

  // Main Sidebar Resizing
  const [mainSidebarWidth, setMainSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('ds-main-sidebar-width');
    return saved ? parseInt(saved, 10) : 240;
  });
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);

  const startResizeSidebar = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSidebar(true);
    document.body.style.cursor = 'col-resize';
    const startX = e.clientX;
    const startWidth = mainSidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      // enforce min width 64 and max 400
      const newWidth = Math.max(64, Math.min(400, startWidth + delta));
      setMainSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDraggingSidebar(false);
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    localStorage.setItem('ds-main-sidebar-width', mainSidebarWidth.toString());
  }, [mainSidebarWidth]);


  // Presets definition
  const presets = [
    { id: 'cyber-hex', name: 'Cyber Hex', prompt: 'High-tech hexagonal geometry, electric neon patterns', style: 'tech', primaryColor: '#09090b', secondaryColor: '#121226', accentColor: '#0070f3' },
    { id: 'glitch-camo', name: 'Glitch Camo', prompt: 'Digital noise glitch distortion camouflage, bright magenta accents', style: 'glitch', primaryColor: '#0a0914', secondaryColor: '#1a1024', accentColor: '#7928ca' },
    { id: 'retro-grid', name: 'Retro Grid', prompt: 'Outrun vaporwave neon wireframe grid, purple sunset hues', style: 'retro', primaryColor: '#09090c', secondaryColor: '#140c1d', accentColor: '#ff0055' },
    { id: 'mech-plate', name: 'Mech Armor', prompt: 'Mecha heavy plate paneling, steel gray and neon lines', style: 'mech', primaryColor: '#111115', secondaryColor: '#24242e', accentColor: '#00e676' },
  ];

  // Helper log addition
  const addLog = (msg: string) => {
    setLogMessages(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 15)]);
  };

  const handleUpdateProject = (updates: Partial<Project>) => {
    setProject(prev => ({ ...prev, ...updates }));
  };

  // Add dummy high-res logo
  const loadHighResLogo = () => {
    const newLogo: SponsorLogo = {
      id: 'high-res-logo',
      name: 'CyberCrest_Primary.png',
      url: '/cyber_crest_logo.png',
      dpi: 300,
      widthPx: 1200,
      heightPx: 1200,
      resolutionStatus: 'high',
      sizeInches: 5.5,
      offsetCollarInches: 3.5,
    };
    setProject(prev => ({
      ...prev,
      logos: [...prev.logos.filter(l => l.id !== 'high-res-logo'), newLogo]
    }));
    addLog('Sponsor logo loaded: CyberCrest_Primary.png (300 DPI — High Res).');
  };

  // Add dummy low-res logo to test pre-flight warning
  const loadLowResLogo = () => {
    const newLogo: SponsorLogo = {
      id: 'low-res-logo',
      name: 'Temp_Sponsor_Web.jpg',
      url: '',
      dpi: 72,
      widthPx: 180,
      heightPx: 120,
      resolutionStatus: 'low',
      sizeInches: 4.0,
      offsetCollarInches: 3.5,
    };
    setProject(prev => ({
      ...prev,
      logos: [...prev.logos.filter(l => l.id !== 'low-res-logo'), newLogo]
    }));
    addLog('Warning: Loaded graphic Temp_Sponsor_Web.jpg under 300 DPI (72 DPI detected).');
  };

  const deleteLogo = (id: string) => {
    setProject(prev => ({
      ...prev,
      logos: prev.logos.filter(l => l.id !== id)
    }));
    addLog('Sponsor logo removed.');
  };

  const handlePresetSelect = (presetId: string) => {
    const p = presets.find(item => item.id === presetId);
    if (!p) return;
    setProject(prev => ({
      ...prev,
      selectedPresetId: presetId,
      prompt: p.prompt,
      baseColors: {
        ...prev.baseColors,
        primary: p.primaryColor,
        secondary: p.secondaryColor,
        accent: p.accentColor,
      }
    }));
    addLog(`Style Preset selected: ${p.name}`);
  };

  const triggerAiGeneration = () => {
    if (!project.prompt) return;
    setAiGenerating(true);
    addLog(`Initiating AI texture generator: "${project.prompt}"`);
    setTimeout(() => {
      setAiGenerating(false);
      setAiHistory(prev => [project.prompt, ...prev]);
      addLog('AI pattern synthesis complete. Sublimation design layer synchronized.');
    }, 1800);
  };

  const activePlayer = project.roster.find(p => p.id === project.activePlayerId);

  return (
    <>
      {/* ====================================================
         VIEW 1: LANDING PAGE
         ==================================================== */}
      {view === 'landing' && (
        <>
          <LandingPage
            session={session}
            onEnterWorkspace={() => setView('dashboard')}
            onShowAuth={() => setShowAuthModal(true)}
          />
          {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
        </>
      )}

      {/* ====================================================
         VIEW 2: PROJECTS DASHBOARD & SETUP MODAL
         ==================================================== */}
      {view === 'dashboard' && (
        <div className="dashboard-container blueprint-grid animate-grid">
          {/* Header */}
          <header className="dashboard-header">
            <div className="dashboard-brand">
              <div className="dashboard-brand-dot" />
              DesignSync
            </div>
            <div className="dashboard-user">
              <button className="ghost" onClick={() => setView('landing')} style={{ fontSize: '12px', padding: '6px 12px' }}>
                <ChevronLeft size={14} /> Landing Page
              </button>
              <button className="ghost" onClick={() => supabase.auth.signOut()} style={{ fontSize: '12px', padding: '6px 12px', color: 'var(--color-warning)' }}>
                Sign Out
              </button>
              <div className="avatar">{session?.user?.email?.charAt(0).toUpperCase() || 'DS'}</div>
            </div>
          </header>

          <div className="dashboard-content">
            {/* Title and Intro */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h1 style={{ fontSize: '32px', fontFamily: 'Outfit', fontWeight: 800, background: 'linear-gradient(90deg, #fff 0%, var(--text-secondary) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Projects Hub
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                Manage sublimation designs, production constraints, and client briefs.
              </p>
            </div>

            {/* Stats Summary Panel */}
            <div className="dashboard-stats-grid">
              <div className="stat-card">
                <div className="stat-label">Active Projects</div>
                <div className="stat-value">{projects.filter(p => !p.isArchived).length}</div>
              </div>
              <div className="stat-card purple">
                <div className="stat-label">Archived Projects</div>
                <div className="stat-value">{projects.filter(p => p.isArchived).length}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Recent Drafts</div>
                <div className="stat-value">{projects.filter(p => p.stage === 'brief' && !p.isArchived).length}</div>
              </div>
            </div>

            {/* Filter toolbar */}
            <div className="dashboard-toolbar">
              <div className="filter-group">
                <button 
                  className={`filter-btn ${activeFilter === 'active' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('active')}
                >
                  Active Projects
                </button>
                <button 
                  className={`filter-btn ${activeFilter === 'drafts' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('drafts')}
                >
                  Recent Drafts
                </button>
                <button 
                  className={`filter-btn ${activeFilter === 'archived' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('archived')}
                >
                  Archived
                </button>
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <div className="search-input-wrapper">
                  <input 
                    type="text" 
                    placeholder="Search projects..." 
                    className="search-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <Search size={14} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-disabled)', pointerEvents: 'none' }} />
                </div>

                <button className="primary" onClick={() => setIsModalOpen(true)}>
                  <FolderPlus size={14} /> Create New Project
                </button>
              </div>
            </div>

            {/* Projects Grid List */}
            {(() => {
              const filteredProjects = projects.filter(p => {
                const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
                if (activeFilter === 'active') {
                  return !p.isArchived && matchesSearch;
                } else if (activeFilter === 'archived') {
                  return p.isArchived && matchesSearch;
                } else if (activeFilter === 'drafts') {
                  return !p.isArchived && p.stage === 'brief' && matchesSearch;
                }
                return matchesSearch;
              });

              if (filteredProjects.length === 0) {
                return (
                  <div className="dashboard-empty">
                    <Folder size={32} style={{ color: 'var(--text-disabled)' }} />
                    <div className="dashboard-empty-title">No projects found</div>
                    <div className="dashboard-empty-desc">
                      {searchQuery ? `No results match "${searchQuery}". Try refining your search.` : 'Get started by creating your first production project.'}
                    </div>
                    {!searchQuery && (
                      <button className="primary" onClick={() => setIsModalOpen(true)} style={{ marginTop: '8px' }}>
                        <Plus size={14} /> New Project
                      </button>
                    )}
                  </div>
                );
              }

              return (
                <div className="projects-grid">
                  {filteredProjects.map((p) => {
                    const createdDate = p.createdAt ? new Date(p.createdAt).toLocaleDateString(undefined, {
                      year: 'numeric', month: 'short', day: 'numeric'
                    }) : 'Unknown Date';

                    return (
                      <div className="project-card" key={p.id}>
                        <div className="project-thumbnail-area">
                          {p.apparelType === 'esports_jersey' ? (
                            <svg className="project-thumbnail-icon" viewBox="0 0 100 120" width="54" height="64" style={{ fill: 'none', stroke: 'var(--text-secondary)', strokeWidth: '1.2' }}>
                              <path d="M 20,20 C 35,10 65,10 80,20 L 90,50 L 78,54 L 79,110 C 60,115 40,115 21,110 L 22,54 L 10,50 Z" />
                            </svg>
                          ) : (
                            <svg className="project-thumbnail-icon" viewBox="0 0 100 120" width="54" height="64" style={{ fill: 'none', stroke: 'var(--text-secondary)', strokeWidth: '1.2' }}>
                              <path d="M 20,25 C 35,15 65,15 80,25 L 95,75 L 85,78 L 80,110 L 20,110 L 15,78 L 5,75 Z" />
                            </svg>
                          )}
                          <span className={`project-thumbnail-banner ${p.isArchived ? 'archive-tag' : 'active-tag'}`}>
                            {p.isArchived ? 'Archived' : p.stage === 'brief' ? 'Draft' : p.stage === 'design' ? 'AI Design' : p.stage === 'studio' ? 'Studio' : 'Export'}
                          </span>
                        </div>

                        <div className="project-card-body">
                          <div className="project-card-title-row">
                            <h3 className="project-card-title">{p.name}</h3>
                            <span className="project-card-date">{createdDate}</span>
                          </div>
                          <div className="project-spec-badges">
                            <span className="spec-badge">
                              {p.apparelType === 'esports_jersey' ? 'Jersey' : 'Crewneck'}
                            </span>
                            {p.templateChoice && <span className="spec-badge">{p.templateChoice}</span>}
                            {p.canvasSize && <span className="spec-badge">{p.canvasSize}</span>}
                            {p.dpi && <span className="spec-badge">{p.dpi} DPI</span>}
                            {p.colorMode && <span className="spec-badge">{p.colorMode}</span>}
                          </div>
                        </div>

                        <div className="project-card-footer">
                          <button className="primary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => handleOpenProject(p)}>
                            Open Workspace <ArrowRight size={12} />
                          </button>
                          
                          <div className="project-actions">
                            <button 
                              title={p.isArchived ? 'Restore Project' : 'Archive Project'}
                              onClick={() => handleToggleArchive(p.id)}
                            >
                              <Archive size={14} style={{ color: p.isArchived ? 'var(--color-success)' : 'var(--text-secondary)' }} />
                            </button>
                            <button 
                              className="delete-btn"
                              title="Delete Project"
                              onClick={() => handleDeleteProject(p.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Project Setup Modal */}
          {isModalOpen && (
            <div className="modal-overlay">
              <div className="modal-card">
                <div className="modal-header">
                  <h2 className="modal-title">
                    <FolderPlus size={18} style={{ color: 'var(--accent-blue)' }} /> Create New Project
                  </h2>
                  <button className="ghost" style={{ padding: '4px' }} onClick={() => setIsModalOpen(false)}>
                    <X size={16} />
                  </button>
                </div>

                <div className="modal-body">
                  {/* Name */}
                  <div className="form-group">
                    <label className="form-label">Project Name</label>
                    <input 
                      type="text" 
                      className="form-input-text" 
                      placeholder="e.g. Neon Strike Esports Jersey"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                    />
                  </div>

                  {/* Garment Type */}
                  <div className="form-group">
                    <label className="form-label">Garment Type</label>
                    <div className="selector-card-grid">
                      <div 
                        className={`selector-card ${newGarmentType === 'esports_jersey' ? 'active' : ''}`}
                        onClick={() => setNewGarmentType('esports_jersey')}
                      >
                        <svg viewBox="0 0 100 120" width="24" height="28" style={{ stroke: 'var(--text-primary)', fill: 'none', strokeWidth: 1.5 }}>
                          <path d="M 20,20 C 35,10 65,10 80,20 L 90,50 L 78,54 L 79,110 C 60,115 40,115 21,110 L 22,54 L 10,50 Z" />
                        </svg>
                        <div className="selector-card-info">
                          <span className="selector-card-title">Esports Jersey</span>
                          <span className="selector-card-desc">Standard raglan pattern</span>
                        </div>
                      </div>

                      <div 
                        className={`selector-card ${newGarmentType === 'crewneck_sweatshirt' ? 'active' : ''}`}
                        onClick={() => setNewGarmentType('crewneck_sweatshirt')}
                      >
                        <svg viewBox="0 0 100 120" width="24" height="28" style={{ stroke: 'var(--text-primary)', fill: 'none', strokeWidth: 1.5 }}>
                          <path d="M 20,25 C 35,15 65,15 80,25 L 95,75 L 85,78 L 80,110 L 20,110 L 15,78 L 5,75 Z" />
                        </svg>
                        <div className="selector-card-info">
                          <span className="selector-card-title">Sweatshirt</span>
                          <span className="selector-card-desc">Loose crewneck long sleeve</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Template Choice */}
                  <div className="form-group">
                    <label className="form-label">Template / Fit</label>
                    <div className="selector-card-grid">
                      <div 
                        className={`selector-card ${newTemplateChoice === 'Pro Athletic Fit' ? 'active' : ''}`}
                        onClick={() => setNewTemplateChoice('Pro Athletic Fit')}
                      >
                        <div className="selector-card-info">
                          <span className="selector-card-title">Pro Athletic Fit</span>
                          <span className="selector-card-desc">Contoured silhouette for compression</span>
                        </div>
                      </div>

                      <div 
                        className={`selector-card ${newTemplateChoice === 'Standard Fit' ? 'active' : ''}`}
                        onClick={() => setNewTemplateChoice('Standard Fit')}
                      >
                        <div className="selector-card-info">
                          <span className="selector-card-title">Standard Fit</span>
                          <span className="selector-card-desc">Classic straight cut drape</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Row of Sizing options */}
                  <div style={{ display: 'flex', gap: '16px' }}>
                    {/* Canvas Size */}
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Canvas Size</label>
                      <div className="segmented-selector">
                        <div 
                          className={`segmented-option ${newCanvasSize === '2400 x 2400 px' ? 'active' : ''}`}
                          onClick={() => setNewCanvasSize('2400 x 2400 px')}
                        >
                          2400px
                        </div>
                        <div 
                          className={`segmented-option ${newCanvasSize === '3000 x 3000 px' ? 'active' : ''}`}
                          onClick={() => setNewCanvasSize('3000 x 3000 px')}
                        >
                          3000px
                        </div>
                      </div>
                    </div>

                    {/* DPI */}
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Print Resolution (DPI)</label>
                      <div className="segmented-selector">
                        <div 
                          className={`segmented-option ${newDpi === 150 ? 'active' : ''}`}
                          onClick={() => setNewDpi(150)}
                        >
                          150 DPI
                        </div>
                        <div 
                          className={`segmented-option ${newDpi === 300 ? 'active' : ''}`}
                          onClick={() => setNewDpi(300)}
                        >
                          300 DPI
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Color Mode */}
                  <div className="form-group">
                    <label className="form-label">Color Space</label>
                    <div className="segmented-selector">
                      <div 
                        className={`segmented-option ${newColorMode === 'CMYK' ? 'active' : ''}`}
                        onClick={() => setNewColorMode('CMYK')}
                      >
                        CMYK (Sublimation Print)
                      </div>
                      <div 
                        className={`segmented-option ${newColorMode === 'RGB' ? 'active' : ''}`}
                        onClick={() => setNewColorMode('RGB')}
                      >
                        RGB (Digital Concept)
                      </div>
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button className="ghost" onClick={() => setIsModalOpen(false)}>Cancel</button>
                  <button className="primary" onClick={handleCreateProject} disabled={!newProjectName.trim()}>
                    Create Project
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================
         VIEW 2: EDITOR WORKSPACE
         ==================================================== */}
      {view === 'editor' && (
        <div className="editor-container">
          
          <header className="editor-topbar" style={{ height: '56px', maxHeight: '56px' }}>
            
            {/* Topbar Left */}
            <div className="topbar-left">
              <button className="ghost" onClick={() => setView('dashboard')} style={{ padding: '4px', borderRadius: '4px' }}>
                <ChevronLeft size={16} />
              </button>
              <div className="topbar-brand">
                <div style={{ width: '10px', height: '10px', background: 'var(--accent-blue)', borderRadius: '2px' }} />
                DesignSync
              </div>
              <div className="topbar-breadcrumbs">
                <span className="topbar-breadcrumb-separator">/</span>
                <span onClick={() => setView('dashboard')} style={{ cursor: 'pointer', transition: 'color var(--transition-fast)' }} className="breadcrumb-link">Projects</span>
                <span className="topbar-breadcrumb-separator">/</span>
                <span style={{ color: 'var(--text-primary)' }}>{project.name}</span>
              </div>
              <div className="topbar-autosave">
                <div className="autosave-indicator"></div>
                Auto-saved
              </div>
            </div>

            {/* Topbar Center: Segmented Workflow Steps */}
            <div className="topbar-center">
              {(['brief', 'design', 'studio', 'export'] as const).map((stage) => (
                <button
                  key={stage}
                  className={`stage-tab ${project.stage === stage ? 'active' : ''}`}
                  onClick={() => handleUpdateProject({ stage })}
                >
                  {stage === 'brief' && 'Brief'}
                  {stage === 'design' && 'AI Design'}
                  {stage === 'studio' && 'Production Studio'}
                  {stage === 'export' && 'Preflight & Export'}
                </button>
              ))}
            </div>

            {/* Topbar Right: Zoom, Scale, Export button, Avatar */}
            <div className="topbar-right">
              
              {project.stage === 'studio' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRight: '1px solid var(--border-muted)', paddingRight: '12px', marginRight: '12px' }}>
                  {/* Zoom Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-primary)', border: '1px solid var(--border-muted)', borderRadius: '6px', padding: '2px' }}>
                    <button 
                      className="ghost" 
                      style={{ padding: '2px 6px', height: '24px', fontSize: '12px' }}
                      onClick={() => setZoom(z => Math.max(z - 0.1, 0.2))}
                    >
                      -
                    </button>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', width: '36px', textAlign: 'center', color: 'var(--text-primary)' }}>
                      {Math.round(zoom * 100)}%
                    </span>
                    <button 
                      className="ghost" 
                      style={{ padding: '2px 6px', height: '24px', fontSize: '12px' }}
                      onClick={() => setZoom(z => Math.min(z + 0.1, 4.0))}
                    >
                      +
                    </button>
                    <button 
                      className="ghost" 
                      style={{ padding: '2px 6px', height: '24px', fontSize: '10px', fontWeight: 'bold' }}
                      onClick={() => {
                        setZoom(0.85);
                        setPan({ x: 0, y: 0 });
                      }}
                    >
                      Fit
                    </button>
                  </div>
                  
                  {/* Unit Scale Indicator */}
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'monospace', marginLeft: '4px' }}>
                    1 PX = {(0.025 * (project.measurementUnit === 'inches' ? 1 : project.measurementUnit === 'cm' ? 2.54 : 25.4)).toFixed(3)} {project.measurementUnit === 'inches' ? 'IN' : project.measurementUnit === 'cm' ? 'CM' : 'MM'}
                  </span>
                </div>
              )}

              <button className="primary" style={{ padding: '6px 12px', fontSize: '12px', fontWeight: '600' }} onClick={() => handleUpdateProject({ stage: 'export' })}>
                Compile Layouts
              </button>
              <div className="avatar">DS</div>
            </div>

          </header>

          {/* Main Layout Body */}
          <div 
            className={`editor-body ${isSidebarExpanded ? 'expanded-sidebar' : ''}`}
            style={isSidebarExpanded ? { gridTemplateColumns: `${mainSidebarWidth}px 6px 1fr` } : undefined}
          >
            
            {/* Left Sidebar navigation */}
            {(() => {
              const showLabels = isSidebarExpanded && mainSidebarWidth >= 130;
              const buttonStyle = !showLabels ? { justifyContent: 'center', padding: 0 } : undefined;
              return (
                <aside 
                  className="editor-sidebar"
                  style={{
                    width: isSidebarExpanded ? `${mainSidebarWidth}px` : 'var(--sidebar-width)',
                    transition: isDraggingSidebar ? 'none' : undefined,
                  }}
                >
                  <div className="sidebar-nav-group">
                    <button 
                      className={`sidebar-nav-item ${project.stage === 'brief' ? 'active' : ''}`}
                      onClick={() => handleUpdateProject({ stage: 'brief' })}
                      style={buttonStyle}
                    >
                      <FileText size={16} />
                      {showLabels && <span className="sidebar-nav-label">1. Brief Specifications</span>}
                    </button>
                    <button 
                      className={`sidebar-nav-item ${project.stage === 'design' ? 'active' : ''}`}
                      onClick={() => handleUpdateProject({ stage: 'design' })}
                      style={buttonStyle}
                    >
                      <Sparkles size={16} />
                      {showLabels && <span className="sidebar-nav-label">2. AI Design & Mockup</span>}
                    </button>
                    <button 
                      className={`sidebar-nav-item ${project.stage === 'studio' ? 'active' : ''}`}
                      onClick={() => handleUpdateProject({ stage: 'studio' })}
                      style={buttonStyle}
                    >
                      <Layers size={16} />
                      {showLabels && <span className="sidebar-nav-label">3. Production Studio</span>}
                    </button>
                    <button 
                      className={`sidebar-nav-item ${project.stage === 'export' ? 'active' : ''}`}
                      onClick={() => handleUpdateProject({ stage: 'export' })}
                      style={buttonStyle}
                    >
                      <Download size={16} />
                      {showLabels && <span className="sidebar-nav-label">4. Pre-Flight Export</span>}
                    </button>
                  </div>

                  {/* Sidebar bottom toggle */}
                  <div className="sidebar-nav-group">
                    <button className="sidebar-nav-item" onClick={() => setIsSidebarExpanded(!isSidebarExpanded)} style={buttonStyle}>
                      <Menu size={16} />
                      {showLabels && <span className="sidebar-nav-label">Collapse Menu</span>}
                    </button>
                  </div>
                </aside>
              );
            })()}

            {/* Draggable Vertical Divider Main Sidebar */}
            {isSidebarExpanded && (
              <div
                onMouseDown={startResizeSidebar}
                className={`resize-handle-vertical ${isDraggingSidebar ? 'dragging' : ''}`}
                style={{ zIndex: 20 }}
              />
            )}

            {/* Center Content Workspace - Router based on stages */}
            <main style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
              
              {/* STAGE 1: BRIEF SPECIFICATIONS */}
              {project.stage === 'brief' && (
                <div className="brief-workspace">
                  
                  {/* Left Form controls */}
                  <div className="brief-panel">
                    <h3 className="brief-section-title">Apparel Category Spec</h3>
                    <div className="template-grid">
                      <div 
                        className={`template-card ${project.apparelType === 'esports_jersey' ? 'active' : ''}`}
                        onClick={() => handleUpdateProject({ apparelType: 'esports_jersey' })}
                      >
                        {/* Vector Apparel Outline Drawing */}
                        <svg className="template-drawing" viewBox="0 0 100 120">
                          <path d="M 20,20 C 35,10 65,10 80,20 L 90,50 L 78,54 L 79,110 C 60,115 40,115 21,110 L 22,54 L 10,50 Z" fill="none" stroke="var(--text-primary)" strokeWidth="1.5" />
                        </svg>
                        <span className="preset-name">Esports Raglan Jersey</span>
                      </div>
                      
                      <div 
                        className={`template-card ${project.apparelType === 'crewneck_sweatshirt' ? 'active' : ''}`}
                        onClick={() => handleUpdateProject({ apparelType: 'crewneck_sweatshirt' })}
                      >
                        <svg className="template-drawing" viewBox="0 0 100 120">
                          <path d="M 20,25 C 35,15 65,15 80,25 L 95,75 L 85,78 L 80,110 L 20,110 L 15,78 L 5,75 Z" fill="none" stroke="var(--text-primary)" strokeWidth="1.5" />
                        </svg>
                        <span className="preset-name">Crewneck Sweatshirt</span>
                      </div>
                    </div>

                    <h3 className="brief-section-title">Base Sublimation Palette</h3>
                    <div className="color-picker-grid">
                      <div className="color-input-wrapper">
                        <label>Primary</label>
                        <div className="color-swatch-picker" style={{ background: project.baseColors.primary }}>
                          <input type="color" value={project.baseColors.primary} onChange={(e) => handleUpdateProject({ baseColors: { ...project.baseColors, primary: e.target.value } })} />
                        </div>
                      </div>

                      <div className="color-input-wrapper">
                        <label>Secondary</label>
                        <div className="color-swatch-picker" style={{ background: project.baseColors.secondary }}>
                          <input type="color" value={project.baseColors.secondary} onChange={(e) => handleUpdateProject({ baseColors: { ...project.baseColors, secondary: e.target.value } })} />
                        </div>
                      </div>

                      <div className="color-input-wrapper">
                        <label>Accent</label>
                        <div className="color-swatch-picker" style={{ background: project.baseColors.accent }}>
                          <input type="color" value={project.baseColors.accent} onChange={(e) => handleUpdateProject({ baseColors: { ...project.baseColors, accent: e.target.value } })} />
                        </div>
                      </div>

                      <div className="color-input-wrapper">
                        <label>Highlight</label>
                        <div className="color-swatch-picker" style={{ background: project.baseColors.highlight }}>
                          <input type="color" value={project.baseColors.highlight} onChange={(e) => handleUpdateProject({ baseColors: { ...project.baseColors, highlight: e.target.value } })} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Graphics and Logo uploads */}
                  <div className="brief-panel">
                    <h3 className="brief-section-title">Sponsor Graphic Uploads</h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      Verify vector compatibility and pixel resolution constraints before committing prints.
                    </p>
                    
                    <div className="logo-dropzone" onClick={loadHighResLogo}>
                      <Upload size={24} className="logo-dropzone-icon" />
                      <div>
                        <span style={{ color: 'var(--accent-blue)', fontWeight: '600' }}>Upload sponsor logo file</span> or click here to mock high-res upload
                      </div>
                      <span style={{ fontSize: '10px', color: 'var(--text-disabled)' }}>SVG, High-res PNG (300 DPI target)</span>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button className="ghost" onClick={loadLowResLogo} style={{ flex: 1, fontSize: '11px', gap: '4px' }}>
                        <AlertTriangle size={12} style={{ color: 'var(--color-warning)' }} /> Mock Low-Res Upload
                      </button>
                    </div>

                    <div className="logo-list">
                      <h4 style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                        Uploaded Logos ({project.logos.length})
                      </h4>
                      {project.logos.length === 0 ? (
                        <div style={{ padding: '20px 0', textAlign: 'center', fontSize: '11px', color: 'var(--text-disabled)', background: 'var(--bg-primary)', border: '1px solid var(--border-muted)', borderRadius: '6px' }}>
                          No logo assets loaded. Click above to load sample files.
                        </div>
                      ) : (
                        project.logos.map((logo) => (
                          <div className="logo-item" key={logo.id}>
                            <div className="logo-item-info">
                              <div className="logo-thumbnail">
                                {logo.url ? <img src={logo.url} alt={logo.name} /> : 'IMG'}
                              </div>
                              <div className="logo-details">
                                <span className="logo-filename">{logo.name}</span>
                                {logo.resolutionStatus === 'high' ? (
                                  <span className="logo-specs high-res">✓ High Res ({logo.dpi} DPI)</span>
                                ) : (
                                  <span className="logo-specs low-res">⚠ Low Res ({logo.dpi} DPI)</span>
                                )}
                              </div>
                            </div>
                            <button className="ghost" onClick={() => deleteLogo(logo.id)} style={{ padding: '6px' }}>
                              <Trash2 size={12} style={{ color: 'var(--text-disabled)' }} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </div>
              )}

              {/* STAGE 2: AI DESIGN STUDIO — FULL PIPELINE */}
              {project.stage === 'design' && (
                <AIDesignStudio
                  project={project}
                  presets={presets}
                  aiGenerating={aiGenerating}
                  onUpdateProject={handleUpdateProject}
                  onPresetSelect={handlePresetSelect}
                  onGenerate={triggerAiGeneration}
                  onHandoffToProduction={() => handleUpdateProject({ stage: 'studio' })}
                />
              )}


              {/* STAGE 3: PRODUCTION STUDIO (CANVAS + ROSTER HUB + RULES + LAYERS) */}
              {project.stage === 'studio' && (
                <ProductionStudio 
                  project={project}
                  activePlayer={activePlayer}
                  onUpdateProject={handleUpdateProject}
                  zoom={zoom}
                  setZoom={setZoom}
                  pan={pan}
                  setPan={setPan}
                />
              )}

              {/* STAGE 4: EXPORT MANAGER & PRE-FLIGHT DIAGNOSTICS */}
              {project.stage === 'export' && (
                <PreFlightPanel project={project} onUpdateProject={handleUpdateProject} />
              )}

            </main>

          </div>

          {/* Bottom Console logs bar */}
          <footer style={{
            height: '24px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-muted)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px',
            fontSize: '10px', color: 'var(--text-disabled)', fontFamily: 'monospace', zIndex: 11
          }}>
            <div>
              CONSOLE LOGS: {logMessages[0] || 'Idle'}
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div>AI GEN: {aiHistory.length} session{aiHistory.length !== 1 ? 's' : ''}</div>
              <div>ACTIVE WORKSPACE: e:/JEI/DesignSync Automation</div>
              <div>UNIT SCALE: 1 PX = 0.025 IN</div>
            </div>
          </footer>

        </div>
      )}
    </>
  );
}
