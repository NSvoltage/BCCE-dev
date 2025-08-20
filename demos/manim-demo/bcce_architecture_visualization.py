#!/usr/bin/env python3
"""
BCCE Architecture Visualization using Manim
Creates beautiful mathematical animations explaining the layered architecture
"""

from manim import *
import numpy as np

class BCCEArchitectureVisualization(Scene):
    """Main architecture visualization scene"""
    
    def construct(self):
        # Title animation
        self.show_title()
        
        # Layered architecture
        self.show_layered_architecture()
        
        # Identity provider integration
        self.show_identity_providers()
        
        # Data flow animation
        self.show_data_flow()
        
        # Cost optimization visualization
        self.show_cost_optimization()
        
        # Success metrics
        self.show_success_metrics()
    
    def show_title(self):
        """Animated title sequence"""
        
        title = Text("BCCE Enterprise Integration", font_size=48, color=BLUE)
        subtitle = Text("AWS Solutions Library + Governance", font_size=32, color=WHITE)
        subtitle.next_to(title, DOWN)
        
        self.play(Write(title))
        self.play(FadeIn(subtitle))
        self.wait(2)
        self.play(FadeOut(title), FadeOut(subtitle))
    
    def show_layered_architecture(self):
        """Visualize the layered architecture"""
        
        # Create layers
        layers = VGroup()
        
        layer_configs = [
            {"text": "BCCE Governance Layer", "color": GREEN},
            {"text": "Identity Integration", "color": BLUE},
            {"text": "AWS Solutions Library", "color": PURPLE},
            {"text": "Amazon Bedrock", "color": ORANGE}
        ]
        
        for i, config in enumerate(layer_configs):
            rect = Rectangle(width=8, height=1.5, color=config["color"], fill_opacity=0.3)
            text = Text(config["text"], font_size=24, color=WHITE)
            text.move_to(rect.get_center())
            layer = VGroup(rect, text)
            layer.shift(DOWN * i * 1.8)
            layers.add(layer)
        
        layers.move_to(ORIGIN)
        
        # Animate layers appearing
        for layer in layers:
            self.play(DrawBorderThenFill(layer[0]), Write(layer[1]))
        
        self.wait(1)
        
        # Show connections between layers
        arrows = VGroup()
        for i in range(len(layers) - 1):
            arrow = Arrow(
                layers[i].get_bottom(),
                layers[i + 1].get_top(),
                color=YELLOW,
                buff=0.1
            )
            arrows.add(arrow)
        
        self.play(*[Create(arrow) for arrow in arrows])
        self.wait(2)
        
        # Transform to side view
        self.play(
            layers.animate.scale(0.7).to_edge(LEFT),
            arrows.animate.scale(0.7).to_edge(LEFT)
        )
    
    def show_identity_providers(self):
        """Show supported identity providers"""
        
        title = Text("Enterprise Identity Providers", font_size=32, color=BLUE)
        title.to_edge(UP).shift(RIGHT * 3)
        self.play(Write(title))
        
        # Create provider circles
        providers = [
            {"name": "ADFS\n85%", "color": RED},
            {"name": "Azure AD\n60%", "color": BLUE},
            {"name": "AWS SSO\n40%", "color": ORANGE},
            {"name": "Google\n30%", "color": GREEN},
            {"name": "Okta\n25%", "color": PURPLE},
            {"name": "Cognito\n15%", "color": TEAL}
        ]
        
        provider_group = VGroup()
        
        # Arrange in a grid
        for i, provider in enumerate(providers):
            circle = Circle(radius=0.6, color=provider["color"], fill_opacity=0.3)
            text = Text(provider["name"], font_size=16, color=WHITE)
            text.move_to(circle.get_center())
            
            provider_vis = VGroup(circle, text)
            
            # Position in 2x3 grid
            row = i // 3
            col = i % 3
            provider_vis.shift(RIGHT * (col * 2 + 2) + DOWN * (row * 2 - 0.5))
            
            provider_group.add(provider_vis)
        
        # Animate providers appearing with scaling effect
        for provider in provider_group:
            self.play(
                ScaleInPlace(provider, 0),
                provider.animate.scale(1),
                run_time=0.5
            )
        
        self.wait(2)
        
        # Show convergence to single system
        target = Circle(radius=1, color=GOLD, fill_opacity=0.5)
        target.shift(RIGHT * 3)
        target_text = Text("Unified\nAccess", font_size=20, color=WHITE)
        target_text.move_to(target.get_center())
        
        self.play(Transform(provider_group, VGroup(target, target_text)))
        self.wait(2)
        
        self.play(FadeOut(provider_group), FadeOut(title))
    
    def show_data_flow(self):
        """Animate data flow through the system"""
        
        title = Text("Developer Workflow", font_size=32, color=BLUE)
        title.to_edge(UP)
        self.play(Write(title))
        
        # Create workflow stages
        stages = [
            "Authenticate",
            "Authorize",
            "Request Model",
            "Apply Governance",
            "Track Usage",
            "Return Response"
        ]
        
        # Create connected nodes
        nodes = VGroup()
        for i, stage in enumerate(stages):
            if i < 3:
                # Top row
                x = -4 + i * 4
                y = 1
            else:
                # Bottom row
                x = 4 - (i - 3) * 4
                y = -2
            
            node = Circle(radius=0.8, color=BLUE, fill_opacity=0.3)
            node.shift(RIGHT * x + UP * y)
            text = Text(stage, font_size=14, color=WHITE)
            text.move_to(node.get_center())
            nodes.add(VGroup(node, text))
        
        # Draw nodes
        for node in nodes:
            self.play(DrawBorderThenFill(node[0]), Write(node[1]), run_time=0.5)
        
        # Animate data packet flow
        packet = Dot(color=YELLOW, radius=0.2)
        packet.move_to(nodes[0].get_center())
        
        path = []
        for i in range(len(nodes)):
            if i < len(nodes) - 1:
                path.append(Line(
                    nodes[i].get_center(),
                    nodes[i + 1].get_center(),
                    color=GREEN
                ))
        
        # Show packet moving through system
        for i, line in enumerate(path):
            self.play(
                Create(line),
                packet.animate.move_to(nodes[i + 1].get_center()),
                run_time=0.8
            )
        
        # Success indicator
        success = Text("✓ Request Complete", font_size=24, color=GREEN)
        success.next_to(nodes[-1], DOWN)
        self.play(Write(success))
        
        self.wait(2)
        self.play(FadeOut(nodes), FadeOut(packet), FadeOut(success), 
                  *[FadeOut(line) for line in path], FadeOut(title))
    
    def show_cost_optimization(self):
        """Visualize cost optimization over time"""
        
        title = Text("Cost Optimization", font_size=32, color=BLUE)
        title.to_edge(UP)
        self.play(Write(title))
        
        # Create axes
        axes = Axes(
            x_range=[0, 12, 1],
            y_range=[0, 50000, 10000],
            axis_config={"color": WHITE},
            x_length=8,
            y_length=5
        )
        axes.shift(DOWN * 0.5)
        
        x_label = Text("Months", font_size=20, color=WHITE)
        x_label.next_to(axes.x_axis, DOWN)
        y_label = Text("Cost ($)", font_size=20, color=WHITE)
        y_label.next_to(axes.y_axis, LEFT).rotate(PI/2)
        
        self.play(Create(axes), Write(x_label), Write(y_label))
        
        # Before BCCE line (higher cost)
        before_data = [40000, 41000, 42000, 43000, 44000, 45000, 
                      46000, 47000, 48000, 49000, 50000, 50000]
        before_points = [axes.coords_to_point(i, cost) for i, cost in enumerate(before_data)]
        before_line = VMobject(color=RED)
        before_line.set_points_smoothly(before_points)
        
        # After BCCE line (optimized cost)
        after_data = [40000, 38000, 35000, 32000, 30000, 28000,
                     27000, 26000, 25000, 25000, 25000, 25000]
        after_points = [axes.coords_to_point(i, cost) for i, cost in enumerate(after_data)]
        after_line = VMobject(color=GREEN)
        after_line.set_points_smoothly(after_points)
        
        # Labels
        before_label = Text("Without BCCE", font_size=16, color=RED)
        before_label.next_to(before_line.get_end(), UP)
        
        after_label = Text("With BCCE", font_size=16, color=GREEN)
        after_label.next_to(after_line.get_end(), DOWN)
        
        # Animate lines
        self.play(Create(before_line), Write(before_label))
        self.play(Create(after_line), Write(after_label))
        
        # Show savings
        savings_arrow = DoubleArrow(
            axes.coords_to_point(11, 50000),
            axes.coords_to_point(11, 25000),
            color=YELLOW
        )
        savings_text = Text("50% Savings", font_size=20, color=YELLOW)
        savings_text.next_to(savings_arrow, RIGHT)
        
        self.play(Create(savings_arrow), Write(savings_text))
        
        self.wait(3)
        self.play(FadeOut(axes), FadeOut(before_line), FadeOut(after_line),
                  FadeOut(before_label), FadeOut(after_label),
                  FadeOut(savings_arrow), FadeOut(savings_text),
                  FadeOut(x_label), FadeOut(y_label), FadeOut(title))
    
    def show_success_metrics(self):
        """Display success metrics"""
        
        title = Text("Production Ready", font_size=48, color=GREEN)
        self.play(Write(title))
        self.wait(1)
        self.play(title.animate.to_edge(UP))
        
        metrics = [
            {"label": "Deployment Time", "value": "< 30 min", "color": BLUE},
            {"label": "Test Success", "value": "100%", "color": GREEN},
            {"label": "Identity Providers", "value": "6 types", "color": PURPLE},
            {"label": "Cost Reduction", "value": "30-50%", "color": ORANGE}
        ]
        
        metric_group = VGroup()
        for i, metric in enumerate(metrics):
            # Create metric box
            box = Rectangle(width=3, height=1.5, color=metric["color"], fill_opacity=0.3)
            label = Text(metric["label"], font_size=16, color=WHITE)
            value = Text(metric["value"], font_size=24, color=metric["color"])
            
            label.shift(UP * 0.3)
            value.shift(DOWN * 0.3)
            
            metric_vis = VGroup(box, label, value)
            
            # Position in 2x2 grid
            row = i // 2
            col = i % 2
            metric_vis.shift(RIGHT * (col * 4 - 2) + DOWN * (row * 2))
            
            metric_group.add(metric_vis)
        
        # Animate metrics appearing
        for metric in metric_group:
            self.play(DrawBorderThenFill(metric[0]), 
                     Write(metric[1]), Write(metric[2]),
                     run_time=0.7)
        
        self.wait(2)
        
        # Final message
        final = Text("Deploy Today!", font_size=36, color=GOLD)
        final.next_to(metric_group, DOWN, buff=1)
        self.play(Write(final))
        self.wait(3)


class DeveloperJourneyVisualization(Scene):
    """Visualize a developer's journey through the system"""
    
    def construct(self):
        # Create developer avatar
        developer = Circle(radius=0.3, color=BLUE, fill_opacity=1)
        dev_text = Text("Dev", font_size=12, color=WHITE)
        dev_text.move_to(developer.get_center())
        dev_avatar = VGroup(developer, dev_text)
        dev_avatar.to_edge(LEFT).shift(UP * 2)
        
        self.play(FadeIn(dev_avatar))
        
        # Create system components
        components = self.create_system_components()
        self.play(*[FadeIn(comp) for comp in components])
        
        # Animate developer journey
        self.animate_developer_journey(dev_avatar, components)
    
    def create_system_components(self):
        """Create visual system components"""
        
        components = []
        
        # Identity Provider
        idp = Rectangle(width=2, height=1, color=PURPLE, fill_opacity=0.3)
        idp.shift(RIGHT * 0 + UP * 2)
        idp_text = Text("Identity\nProvider", font_size=14, color=WHITE)
        idp_text.move_to(idp.get_center())
        components.append(VGroup(idp, idp_text))
        
        # Cognito
        cognito = Rectangle(width=2, height=1, color=BLUE, fill_opacity=0.3)
        cognito.shift(RIGHT * 3 + UP * 2)
        cognito_text = Text("Cognito", font_size=14, color=WHITE)
        cognito_text.move_to(cognito.get_center())
        components.append(VGroup(cognito, cognito_text))
        
        # BCCE Governance
        bcce = Rectangle(width=2, height=1, color=GREEN, fill_opacity=0.3)
        bcce.shift(RIGHT * 3 + DOWN * 0)
        bcce_text = Text("BCCE\nGovernance", font_size=14, color=WHITE)
        bcce_text.move_to(bcce.get_center())
        components.append(VGroup(bcce, bcce_text))
        
        # Bedrock
        bedrock = Rectangle(width=2, height=1, color=ORANGE, fill_opacity=0.3)
        bedrock.shift(RIGHT * 0 + DOWN * 2)
        bedrock_text = Text("Bedrock\nClaude", font_size=14, color=WHITE)
        bedrock_text.move_to(bedrock.get_center())
        components.append(VGroup(bedrock, bedrock_text))
        
        # Analytics
        analytics = Rectangle(width=2, height=1, color=TEAL, fill_opacity=0.3)
        analytics.shift(LEFT * 3 + DOWN * 0)
        analytics_text = Text("Analytics", font_size=14, color=WHITE)
        analytics_text.move_to(analytics.get_center())
        components.append(VGroup(analytics, analytics_text))
        
        return components
    
    def animate_developer_journey(self, dev_avatar, components):
        """Animate the developer's journey through the system"""
        
        # Journey steps with descriptions
        journey = [
            (components[0], "Authenticate with SSO"),
            (components[1], "Get AWS credentials"),
            (components[2], "Apply governance rules"),
            (components[3], "Access Claude models"),
            (components[4], "Track usage & costs")
        ]
        
        for component, description in journey:
            # Move developer to component
            self.play(dev_avatar.animate.move_to(
                component.get_center() + UP * 0.8
            ))
            
            # Show description
            desc_text = Text(description, font_size=16, color=YELLOW)
            desc_text.next_to(component, DOWN)
            self.play(Write(desc_text))
            self.wait(1)
            self.play(FadeOut(desc_text))
        
        # Return to start
        self.play(dev_avatar.animate.to_edge(LEFT).shift(UP * 2))
        
        # Success message
        success = Text("✓ Ready to build with Claude!", font_size=24, color=GREEN)
        success.to_edge(DOWN)
        self.play(Write(success))
        self.wait(2)


# Command to render the videos:
# manim -pql bcce_architecture_visualization.py BCCEArchitectureVisualization
# manim -pqh bcce_architecture_visualization.py DeveloperJourneyVisualization