import { type FC } from 'react';
import { Brush, Save } from '@mui/icons-material';
import { Tooltip, Button, ButtonGroup, Typography, Box } from '@mui/material';

interface ToolbarProps {
  currentTool: string;
  onToolChange: (tool: string) => void;
  onExportMask?: () => void;
}

const Toolbar: FC<ToolbarProps> = ({ currentTool, onToolChange, onExportMask }) => {
  return (
    <Box sx={{
      display: 'flex',
      padding: '0.5rem 0.75rem',
      backgroundColor: '#222',
      borderRadius: '6px',
      alignItems: 'center',
      gap: '1rem',
      flexWrap: 'wrap',
      minHeight: '48px'
    }}>
      <Typography variant="subtitle2" sx={{ marginRight: '0.5rem', fontSize: '0.8rem' }}>
        Tools:
      </Typography>
      
      <ButtonGroup variant="contained" size="small">
        <Tooltip title="Mask Drawing Tool - Scroll to adjust brush size">
          <Button
            variant={currentTool === 'mask' ? 'contained' : 'outlined'}
            color={currentTool === 'mask' ? 'secondary' : 'primary'}
            onClick={() => onToolChange('mask')}
            startIcon={<Brush fontSize="small" />}
            size="small"
          >
            Mask
          </Button>
        </Tooltip>
      </ButtonGroup>
      
      <Button
        variant="contained"
        color="primary"
        startIcon={<Save fontSize="small" />}
        size="small"
        onClick={onExportMask}
        disabled={!onExportMask}
        sx={{ ml: 1 }}
      >
        Export Mask
      </Button>
      
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '0.5rem',
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: '0.25rem 0.5rem',
        borderRadius: '4px',
        marginLeft: 'auto',
        fontSize: '0.75rem'
      }}>
        <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
          <Box component="span" sx={{ color: 'rgba(255,0,0,0.7)' }}>Tip:</Box> Scroll to adjust brush • Ctrl+Scroll to zoom • Ctrl+0 to reset • Space+drag to pan
        </Typography>
      </Box>
    </Box>
  );
};

export default Toolbar; 