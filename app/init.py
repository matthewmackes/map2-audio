"""
LCD Event System - Complete Initialization
Bootstraps entire system with all 10 improvements
"""

import logging
import sqlite3
from typing import Dict
from pathlib import Path
from datetime import datetime, timezone

from app.config.settings import config
from app.services.alert_services import (
    AlertPrioritizer,
    ContextualAlertRouter,
    AlertGrouper,
    NodeRole
)
from app.services.advanced_services import (
    AlertAcknowledgmentManager,
    EventCorrelationEngine,
    AlertRulesEngine,
    AlertAnalyticsEngine,
    SmartDismissalManager,
    SystemContextTracker,
    PatternDetectionEngine
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class LCDEventSystemInitializer:
    """Initialize complete LCD event system"""
    
    def __init__(self):
        self.db_path = config.get('database.path')
        self.services: Dict = {}
        logger.info("Initializing LCD Event System")
    
    def initialize_database(self) -> bool:
        """Create database schema"""
        try:
            logger.info(f"Initializing database at {self.db_path}")
            
            # Read schema
            schema_path = Path(__file__).parent / 'db' / 'schema.sql'
            if not schema_path.exists():
                logger.error(f"Schema file not found: {schema_path}")
                return False
            
            with open(schema_path, 'r') as f:
                schema = f.read()
            
            # Create connection and execute schema
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Execute each statement
            for statement in schema.split(';'):
                if statement.strip():
                    try:
                        cursor.execute(statement)
                    except sqlite3.OperationalError as e:
                        if 'already exists' not in str(e):
                            raise
            
            conn.commit()
            conn.close()
            
            logger.info("Database initialization complete")
            return True
        
        except Exception as e:
            logger.error(f"Database initialization failed: {e}")
            return False
    
    def initialize_services(self, db_conn=None) -> Dict:
        """Initialize all service instances"""
        try:
            logger.info("Initializing all services...")
            
            # Improvement 1: Alert Prioritizer
            self.services['prioritizer'] = AlertPrioritizer(db_conn)
            logger.info("✓ AlertPrioritizer initialized")
            
            # Improvement 2: Contextual Router
            self.services['router'] = ContextualAlertRouter(db_conn)
            logger.info("✓ ContextualAlertRouter initialized")
            
            # Improvement 3: Alert Grouper
            self.services['grouper'] = AlertGrouper(
                window_seconds=config.get('grouper.window_seconds', 60),
                db_conn=db_conn
            )
            logger.info("✓ AlertGrouper initialized")
            
            # Improvement 4: Acknowledgment Manager
            self.services['acknowledgment'] = AlertAcknowledgmentManager(db_conn)
            logger.info("✓ AlertAcknowledgmentManager initialized")
            
            # Improvement 5: Event Correlation Engine
            self.services['correlation'] = EventCorrelationEngine(db_conn)
            logger.info("✓ EventCorrelationEngine initialized")
            
            # Improvement 6: Rules Engine
            self.services['rules'] = AlertRulesEngine(db_conn)
            logger.info("✓ AlertRulesEngine initialized")
            
            # Improvement 7: Analytics Engine
            self.services['analytics'] = AlertAnalyticsEngine(db_conn)
            logger.info("✓ AlertAnalyticsEngine initialized")
            
            # Improvement 8: Smart Dismissal Manager
            self.services['dismissal'] = SmartDismissalManager(db_conn)
            logger.info("✓ SmartDismissalManager initialized")
            
            # Improvement 9: System Context Tracker
            self.services['context'] = SystemContextTracker(db_conn)
            logger.info("✓ SystemContextTracker initialized")
            
            # Improvement 10: Pattern Detection Engine
            self.services['patterns'] = PatternDetectionEngine(db_conn)
            logger.info("✓ PatternDetectionEngine initialized")
            
            logger.info("All 10 services initialized successfully!")
            return self.services
        
        except Exception as e:
            logger.error(f"Service initialization failed: {e}")
            raise
    
    def register_default_nodes(self):
        """Register default nodes with roles"""
        try:
            router = self.services['router']
            
            default_nodes = [
                ('audio-1', NodeRole.AUDIO_NODE),
                ('audio-2', NodeRole.AUDIO_NODE),
                ('control-1', NodeRole.CONTROL_NODE),
                ('interface-1', NodeRole.INTERFACE_NODE),
                ('utility-1', NodeRole.UTILITY_NODE),
            ]
            
            for node_id, role in default_nodes:
                router.register_node(node_id, role)
                logger.info(f"Registered node {node_id} as {role}")
            
            return True
        
        except Exception as e:
            logger.error(f"Node registration failed: {e}")
            return False
    
    def load_configuration(self):
        """Load configuration from files"""
        try:
            config.load_from_file('config.json')
            logger.info("Configuration loaded successfully")
            return True
        except FileNotFoundError:
            logger.info("No saved configuration found, using defaults")
            return True
        except Exception as e:
            logger.error(f"Configuration loading failed: {e}")
            return False
    
    def save_configuration(self):
        """Save configuration to file"""
        try:
            config.save_to_file('config.json')
            logger.info("Configuration saved successfully")
            return True
        except Exception as e:
            logger.error(f"Configuration save failed: {e}")
            return False
    
    def create_sample_rules(self):
        """Create sample rules for demo"""
        try:
            rules_engine = self.services['rules']
            
            sample_rules = [
                {
                    'name': 'Escalate XRUNs',
                    'enabled': True,
                    'priority': 90,
                    'conditions': [
                        {'field': 'event_type', 'operator': 'EQUALS', 'value': 'XRUN'}
                    ],
                    'actions': [
                        {'type': 'escalate', 'multiplier': 1.5}
                    ]
                },
                {
                    'name': 'Suppress Duplicate Warnings',
                    'enabled': True,
                    'priority': 70,
                    'conditions': [
                        {'field': 'severity', 'operator': 'EQUALS', 'value': 'WARNING'}
                    ],
                    'actions': [
                        {'type': 'suppress', 'duration': 300}
                    ]
                },
                {
                    'name': 'Alert on High CPU',
                    'enabled': True,
                    'priority': 80,
                    'conditions': [
                        {'field': 'event_type', 'operator': 'EQUALS', 'value': 'CPU_HIGH'}
                    ],
                    'actions': [
                        {'type': 'notify', 'target': 'admin'}
                    ]
                }
            ]
            
            for rule_dict in sample_rules:
                rules_engine.create_rule(rule_dict)
                logger.info(f"Created rule: {rule_dict['name']}")
            
            return True
        
        except Exception as e:
            logger.error(f"Sample rule creation failed: {e}")
            return False
    
    def run_initialization(self) -> bool:
        """Run complete initialization"""
        try:
            logger.info("=" * 60)
            logger.info("MAP2 AUDIO LCD EVENT SYSTEM - INITIALIZATION")
            logger.info("=" * 60)
            
            # Step 1: Load configuration
            if not self.load_configuration():
                logger.warning("Configuration loading had issues")
            
            # Step 2: Initialize database
            if not self.initialize_database():
                logger.error("Database initialization failed!")
                return False
            
            # Step 3: Initialize services
            try:
                db_conn = sqlite3.connect(self.db_path)
                self.initialize_services(db_conn)
                db_conn.close()
            except Exception as e:
                logger.error(f"Service initialization failed: {e}")
                return False
            
            # Step 4: Register default nodes
            if not self.register_default_nodes():
                logger.warning("Node registration had issues")
            
            # Step 5: Create sample rules
            if not self.create_sample_rules():
                logger.warning("Sample rule creation had issues")
            
            # Step 6: Save configuration
            if not self.save_configuration():
                logger.warning("Configuration save had issues")
            
            logger.info("=" * 60)
            logger.info("✓ INITIALIZATION COMPLETE")
            logger.info("=" * 60)
            logger.info("System is ready to process alerts!")
            logger.info(f"Database: {self.db_path}")
            logger.info(f"Services: {len(self.services)} initialized")
            logger.info(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
            
            return True
        
        except Exception as e:
            logger.error(f"Initialization failed: {e}")
            return False


def initialize_system() -> Dict:
    """Main initialization function"""
    initializer = LCDEventSystemInitializer()
    
    if initializer.run_initialization():
        return initializer.services
    else:
        raise RuntimeError("LCD Event System initialization failed!")


if __name__ == '__main__':
    try:
        services = initialize_system()
        logger.info(f"System ready with {len(services)} services")
    except Exception as e:
        logger.error(f"Failed to initialize: {e}")
        exit(1)
